import { prisma } from "@/lib/prisma";
import { runAnthropic } from "@/lib/anthropic";
import { logger } from "@/lib/logger";

export interface ProjectFileResult {
  id: string;
  path: string;
  content: string;
  summary?: string | null;
  excerpt: string;
}

const STOP_WORDS = new Set([
  "what", "does", "how", "why", "when", "where", "the", "a", "an", "is",
  "are", "was", "were", "be", "been", "have", "has", "had", "do", "did",
  "will", "would", "could", "should", "can", "may", "might", "it", "its",
  "this", "that", "these", "those", "in", "on", "at", "to", "for", "of",
  "and", "or", "but", "not", "with", "from", "by", "about", "into", "me",
  "my", "you", "your", "we", "they", "them", "tell", "show", "find", "look",
  "explain", "describe", "help", "please", "give", "get", "make", "use",
  "using", "used", "work", "works", "working", "code", "file", "files",
  "function", "class", "method", "implement", "which", "some", "all",
  "also", "just", "more", "any", "out", "like", "need", "want",
]);

export function extractKeywords(query: string): string {
  const words = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  // :* enables prefix matching so "optimize" matches "OptimizeQueue", "OptimizeScan", etc.
  return [...new Set(words)].slice(0, 10).map((w) => `${w}:*`).join(" | ");
}

// Extracts the most keyword-relevant chunk of ~maxLines from a file.
// Uses a sliding window scored by keyword density + structure bonuses.
// Returns the full content unchanged if the file is short enough.
export function extractRelevantChunk(content: string, query: string, maxLines = 120): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;

  const keywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .slice(0, 15);

  if (keywords.length === 0) return lines.slice(0, maxLines).join("\n");

  const STEP = Math.max(1, Math.floor(maxLines / 4));
  let bestScore = -1;
  let bestStart = 0;

  for (let i = 0; i <= lines.length - maxLines; i += STEP) {
    const windowText = lines.slice(i, i + maxLines).join("\n").toLowerCase();
    const score = keywords.reduce((s, kw) => s + (windowText.includes(kw) ? 1 : 0), 0);
    // Bonus for windows starting at a class/function declaration
    const topLines = lines.slice(i, i + 4).join("\n");
    const structureBonus = /\b(class |interface |enum |public |private |protected |static |def |function |async )\b/.test(topLines) ? 0.3 : 0;
    const adjusted = score + structureBonus;
    if (adjusted > bestScore) {
      bestScore = adjusted;
      bestStart = i;
    }
  }

  return lines.slice(bestStart, bestStart + maxLines).join("\n");
}

export async function countProjectFiles(projectId: string): Promise<number> {
  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ProjectFile" WHERE "projectId" = ${projectId}
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function searchProjectFiles(
  projectId: string,
  query: string,
  limit = 15,
): Promise<ProjectFileResult[]> {
  const keywords = extractKeywords(query);

  if (!keywords) {
    const rows = await prisma.$queryRaw<ProjectFileResult[]>`
      SELECT id, path, content, summary, LEFT(content, 400) as excerpt
      FROM "ProjectFile"
      WHERE "projectId" = ${projectId}
      ORDER BY "createdAt" DESC
      LIMIT ${limit}
    `;
    return rows;
  }

  try {
    const rows = await prisma.$queryRaw<ProjectFileResult[]>`
      SELECT id, path, content, summary, LEFT(content, 400) as excerpt
      FROM "ProjectFile"
      WHERE "projectId" = ${projectId}
        AND to_tsvector('simple', content || ' ' || path) @@ to_tsquery('simple', ${keywords})
      ORDER BY ts_rank(
        to_tsvector('simple', content || ' ' || path),
        to_tsquery('simple', ${keywords})
      ) DESC
      LIMIT ${limit}
    `;
    if (rows.length > 0) return rows;

    const firstKeyword = keywords.split(" | ")[0].replace(/:.*$/, "");
    const fallback = await prisma.$queryRaw<ProjectFileResult[]>`
      SELECT id, path, content, summary, LEFT(content, 400) as excerpt
      FROM "ProjectFile"
      WHERE "projectId" = ${projectId}
        AND (content ILIKE ${`%${firstKeyword}%`} OR path ILIKE ${`%${firstKeyword}%`})
      LIMIT ${limit}
    `;
    return fallback;
  } catch {
    return [];
  }
}

export function buildFileContext(
  files: { path: string; content: string }[],
  opts: { maxFileChars?: number; maxTotalChars?: number; query?: string } = {},
): string {
  if (files.length === 0) return "";
  const maxFileChars = opts.maxFileChars ?? 8_000;
  const maxTotalChars = opts.maxTotalChars ?? 50_000;
  const query = opts.query;

  const parts: string[] = [];
  let totalChars = 0;

  for (const f of files) {
    let body = f.content;

    // Intelligent chunking: extract the most relevant section instead of the full file
    if (query && body.length > 3_000) {
      const maxLines = Math.min(120, Math.floor(maxFileChars / 40));
      body = extractRelevantChunk(body, query, maxLines);
    }

    if (body.length > maxFileChars) {
      body = body.slice(0, maxFileChars) + "\n// [file truncated]";
    }

    const block = `--- ${f.path} ---\n${body}`;
    if (totalChars + block.length > maxTotalChars && parts.length > 0) break;
    parts.push(block);
    totalChars += block.length;
  }

  return `RELEVANT FILES (${parts.length} of ${files.length} retrieved for this query):\n\n${parts.join("\n\n")}`;
}

// Builds context using per-file summaries instead of full content.
// Used for broad/natural-language queries where 2-3 sentences per file is sufficient.
export function buildSummaryContext(
  files: { path: string; summary?: string | null; content: string }[],
): string {
  if (files.length === 0) return "";
  const parts = files.map((f) => {
    const body = f.summary?.trim()
      || (f.content.slice(0, 300) + (f.content.length > 300 ? "\n// [no summary — showing excerpt]" : ""));
    return `--- ${f.path} ---\n${body}`;
  });
  return `FILE OVERVIEWS (${parts.length} files — ask about specific files or symbols to get full source):\n\n${parts.join("\n\n")}`;
}

// Returns true if the query contains specific code identifiers that FTS handles well:
// PascalCase class names, camelCase methods, file extensions, ALL_CAPS constants.
export function hasStrongCodeIdentifiers(query: string): boolean {
  if (/\b[A-Z][a-z]+(?:[A-Z][a-z]*)+\b/.test(query)) return true; // PascalCase
  if (/\b[a-z]{2,}[A-Z][a-zA-Z]+\b/.test(query)) return true;     // camelCase
  if (/\b\w+\.[a-zA-Z]{2,5}\b/.test(query)) return true;           // file.ext
  if (/\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/.test(query)) return true;    // ALL_CAPS constants
  return false;
}

export interface CodeChunkResult {
  id: string;
  filePath: string;
  chunkType: string;
  name: string;
  content: string;
  startLine: number;
  endLine: number;
}

// Vector search over individual function/class chunks — more precise than
// whole-file search because each chunk is a complete, named code unit.
async function vectorSearchChunks(
  projectId: string,
  query: string,
  limit: number,
): Promise<CodeChunkResult[]> {
  const { embedQuery, toVectorLiteral } = await import("@/lib/embeddings");
  const queryVec = await embedQuery(query);
  const vecLiteral = toVectorLiteral(queryVec);

  const rows = await prisma.$queryRaw<CodeChunkResult[]>`
    SELECT id, "filePath", "chunkType", name, content, "startLine", "endLine"
    FROM "ProjectFileChunk"
    WHERE "projectId" = ${projectId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vecLiteral}::vector
    LIMIT ${limit}
  `;
  return rows;
}

async function hasChunkIndex(projectId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ProjectFileChunk"
    WHERE "projectId" = ${projectId} AND embedding IS NOT NULL
  `;
  return Number(rows[0]?.count ?? 0) > 0;
}

// Build context string from chunks — shows file path, function name, and line range
// so Claude knows exactly where in the codebase each piece of code lives.
export function buildChunkContext(chunks: CodeChunkResult[]): string {
  if (chunks.length === 0) return "";
  const parts = chunks.map((c) =>
    `--- ${c.filePath} (lines ${c.startLine}-${c.endLine}: ${c.name}) ---\n${c.content}`
  );
  return `RELEVANT CODE (${parts.length} function${parts.length !== 1 ? "s" : ""} retrieved for this query):\n\n${parts.join("\n\n")}`;
}

// Vector search using pgvector cosine similarity.
// Replaces Haiku routing for broad/natural-language queries — faster, cheaper,
// and understands meaning rather than just matching keywords or file names.
async function vectorSearchProjectFiles(
  projectId: string,
  query: string,
  limit: number,
): Promise<ProjectFileResult[]> {
  const { embedQuery, toVectorLiteral } = await import("@/lib/embeddings");
  const queryVec = await embedQuery(query);
  const vecLiteral = toVectorLiteral(queryVec);

  const rows = await prisma.$queryRaw<ProjectFileResult[]>`
    SELECT id, path, content, summary, LEFT(content, 400) as excerpt
    FROM "ProjectFile"
    WHERE "projectId" = ${projectId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vecLiteral}::vector
    LIMIT ${limit}
  `;
  return rows;
}

async function hasVectorIndex(projectId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM "ProjectFile"
    WHERE "projectId" = ${projectId} AND embedding IS NOT NULL
  `;
  return Number(rows[0]?.count ?? 0) > 0;
}

// Phase 1: ask Haiku which files are candidates based on paths + summaries.
// Prompt is deliberately conservative — "only files whose code is directly needed".
async function routeWithHaiku(
  projectId: string,
  query: string,
  limit: number,
): Promise<ProjectFileResult[]> {
  const pathRows = await prisma.$queryRaw<{ id: string; path: string; summary?: string | null }[]>`
    SELECT id, path, summary FROM "ProjectFile"
    WHERE "projectId" = ${projectId}
    ORDER BY path
    LIMIT 500
  `;
  if (pathRows.length === 0) return [];

  const fileList = pathRows.map((f) =>
    f.summary ? `${f.path}: ${f.summary.slice(0, 120)}` : f.path
  ).join("\n");

  let selectedPaths: string[] = [];
  try {
    const result = await runAnthropic({
      model: "claude-haiku-4-5-20251001",
      system: `You are a precise code file selector. Given file paths (and optional summaries) and a question, return ONLY the files whose source code is directly needed to answer the question.
Be strict — prefer 3-6 highly relevant files over a large list of loosely related ones. Do not include files just because they're in the same module or package.
Return ONLY a valid JSON array of file path strings. Example: ["src/Foo.cs","src/Bar.cs"]`,
      messages: [{
        role: "user",
        content: `Files:\n${fileList}\n\nQuestion: ${query}`,
      }],
      maxTokens: 512,
    });

    const cleaned = result.text
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) selectedPaths = parsed.slice(0, limit);
  } catch (err) {
    logger.warn("haiku-routing.failed", { projectId, error: String(err) });
    return [];
  }

  if (selectedPaths.length === 0) return [];

  const idMap = new Map(pathRows.map((r) => [r.path, r.id]));
  const ids = selectedPaths.map((p) => idMap.get(p)).filter(Boolean) as string[];
  if (ids.length === 0) return [];

  const files = await prisma.$queryRaw<ProjectFileResult[]>`
    SELECT id, path, content, summary, LEFT(content, 400) as excerpt
    FROM "ProjectFile"
    WHERE id = ANY(${ids}::text[])
  `;
  return files;
}

// Phase 2: given initial candidates, ask Haiku to filter to only the files
// whose content is DIRECTLY needed — using a content excerpt per file for higher
// signal than just paths. Costs ~$0.0003 per call but prevents sending 10-15
// loosely related files to the main model.
async function rerankByRelevance(
  files: ProjectFileResult[],
  query: string,
  maxFiles = 5,
): Promise<ProjectFileResult[]> {
  if (files.length <= maxFiles) return files;

  const fileList = files.map((f, i) => {
    const preview = (f.summary || f.content).slice(0, 250).replace(/\n+/g, " ");
    return `[${i}] ${f.path}: ${preview}`;
  }).join("\n\n");

  try {
    const result = await runAnthropic({
      model: "claude-haiku-4-5-20251001",
      system: `You output ONLY a valid JSON array of integers — no explanation, no text, nothing else.
Select the indices of files directly needed to answer the question. Maximum ${maxFiles} indices.
Example: [0, 2, 4]`,
      messages: [{
        role: "user",
        content: `Question: ${query}\n\nFiles:\n${fileList}`,
      }],
      maxTokens: 60,
    });

    // Extract a JSON array from the response even if Haiku adds surrounding text
    const arrayMatch = result.text.match(/\[[\d,\s]+\]/);
    if (!arrayMatch) return files.slice(0, maxFiles);
    const indices: unknown = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(indices) || indices.length === 0) return files.slice(0, maxFiles);

    const ranked = (indices as number[])
      .slice(0, maxFiles)
      .map((i) => files[i])
      .filter(Boolean) as ProjectFileResult[];
    return ranked.length > 0 ? ranked : files.slice(0, maxFiles);
  } catch (err) {
    logger.warn("rerank.failed", { error: String(err) });
    return files.slice(0, maxFiles);
  }
}

// FTS results are ranked by relevance — retrieve up to 10, re-rank to 5.
// Haiku routing uses same limits so both paths benefit from the second-pass filter.
const FTS_LIMIT = 10;
const RERANK_TARGET = 6; // raised from 5 — aggressive re-ranking was dropping important files

// Smart search: FTS first (fast, no extra cost). Falls back to Haiku routing
// only when FTS finds nothing or the query lacks specific code identifiers.
// Returns useSummaries=true for broad queries so callers can use buildSummaryContext.
export interface SmartSearchResult {
  files: ProjectFileResult[];
  chunks: CodeChunkResult[];
  method: "fts" | "haiku" | "chunks" | "vector";
  useSummaries: boolean;
}

export async function smartSearchProjectFiles(
  projectId: string,
  query: string,
  haikuLimit = 10,
): Promise<SmartSearchResult> {
  const codeQuery = hasStrongCodeIdentifiers(query);
  const empty = { files: [], chunks: [], useSummaries: false };

  // Path 1: Strong code identifiers — FTS is most reliable for exact symbols
  if (codeQuery) {
    const ftsResults = await searchProjectFiles(projectId, query, FTS_LIMIT);
    if (ftsResults.length > 0) {
      const reranked = await rerankByRelevance(ftsResults, query, RERANK_TARGET);
      logger.info("fts.reranked", { projectId, before: ftsResults.length, after: reranked.length });
      return { ...empty, files: reranked, method: "fts" };
    }
  }

  // Path 2: Chunk-level vector search — most precise for semantic queries.
  // Retrieves specific functions/classes rather than whole files.
  const useChunks = await hasChunkIndex(projectId);
  if (useChunks) {
    logger.info("chunk-search.start", { projectId, query: query.slice(0, 80) });
    const chunkResults = await vectorSearchChunks(projectId, query, RERANK_TARGET);
    if (chunkResults.length > 0) {
      logger.info("chunk-search.complete", { projectId, count: chunkResults.length });
      return { ...empty, chunks: chunkResults, method: "chunks" };
    }
  }

  // Path 3: File-level vector search (whole files, semantic)
  const useVector = await hasVectorIndex(projectId);
  if (useVector) {
    logger.info("vector-search.start", { projectId, query: query.slice(0, 80) });
    const vectorResults = await vectorSearchProjectFiles(projectId, query, haikuLimit);
    if (vectorResults.length > 0) {
      const reranked = await rerankByRelevance(vectorResults, query, RERANK_TARGET);
      logger.info("vector-search.complete", { projectId, before: vectorResults.length, after: reranked.length });
      const keywords = extractKeywords(query);
      const keywordCount = keywords ? keywords.split(" | ").length : 0;
      const queryIsVague = !codeQuery && keywordCount <= 2;
      const hasSummaries = queryIsVague && reranked.every((f) => f.summary);
      return { ...empty, files: reranked, method: "vector", useSummaries: hasSummaries };
    }
  }

  // Path 4: Haiku routing fallback (no embeddings yet)
  logger.info("haiku-routing.start", { projectId, query: query.slice(0, 80) });
  const haikuResults = await routeWithHaiku(projectId, query, haikuLimit);
  if (haikuResults.length > 0) {
    const reranked = await rerankByRelevance(haikuResults, query, RERANK_TARGET);
    logger.info("haiku-routing.complete", { projectId, before: haikuResults.length, after: reranked.length });
    const keywords = extractKeywords(query);
    const keywordCount = keywords ? keywords.split(" | ").length : 0;
    const queryIsVague = !codeQuery && keywordCount <= 2;
    const hasSummaries = queryIsVague && reranked.every((f) => f.summary);
    return { ...empty, files: reranked, method: "haiku", useSummaries: hasSummaries };
  }

  const fallback = await searchProjectFiles(projectId, query, FTS_LIMIT);
  const rerankedFallback = await rerankByRelevance(fallback, query, RERANK_TARGET);
  return { ...empty, files: rerankedFallback, method: "fts" };
}
