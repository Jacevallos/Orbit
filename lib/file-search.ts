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

// Phase 1 of two-phase routing: ask Haiku which files are relevant.
// Uses path + summary (when available) so Haiku can make better decisions.
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

  // Include summaries in file listing if available — helps Haiku pick better
  const fileList = pathRows.map((f) =>
    f.summary ? `${f.path}: ${f.summary.slice(0, 120)}` : f.path
  ).join("\n");

  let selectedPaths: string[] = [];
  try {
    const result = await runAnthropic({
      model: "claude-haiku-4-5-20251001",
      system: `You are a code file selector. Given a list of file paths (and optional summaries) and a question, return the paths of the ${limit} files most relevant to answering the question.
Return ONLY a valid JSON array of file path strings — no explanation, no markdown, just JSON. Example: ["src/Foo.cs","src/Bar.cs"]`,
      messages: [{
        role: "user",
        content: `Files:\n${fileList}\n\nQuestion: ${query}`,
      }],
      maxTokens: 1024,
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

// FTS results are already ranked by relevance — the top 8 are the signal, beyond that is noise.
// Haiku routing covers broad queries where wider file coverage improves answer quality.
const FTS_LIMIT = 8;

// Smart search: FTS first (fast, no extra cost). Falls back to Haiku routing
// only when FTS finds nothing or the query lacks specific code identifiers.
// Returns useSummaries=true for broad queries so callers can use buildSummaryContext.
export async function smartSearchProjectFiles(
  projectId: string,
  query: string,
  haikuLimit = 14,
): Promise<{ files: ProjectFileResult[]; method: "fts" | "haiku"; useSummaries: boolean }> {
  const codeQuery = hasStrongCodeIdentifiers(query);

  if (codeQuery) {
    // FTS is relevance-ranked — cap at 8, beyond that adds noise not signal
    const ftsResults = await searchProjectFiles(projectId, query, FTS_LIMIT);
    if (ftsResults.length > 0) {
      return { files: ftsResults, method: "fts", useSummaries: false };
    }
  }

  logger.info("haiku-routing.start", { projectId, query: query.slice(0, 80) });
  const haikuResults = await routeWithHaiku(projectId, query, haikuLimit);

  if (haikuResults.length > 0) {
    logger.info("haiku-routing.complete", { projectId, count: haikuResults.length });
    // Use summaries only for genuinely vague queries — 0-2 specific keywords, no code identifiers.
    // Semi-specific questions ("how does auth work?") still get full content + chunking.
    const keywords = extractKeywords(query);
    const keywordCount = keywords ? keywords.split(" | ").length : 0;
    const queryIsVague = !codeQuery && keywordCount <= 2;
    const hasSummaries = queryIsVague && haikuResults.every((f) => f.summary);
    return { files: haikuResults, method: "haiku", useSummaries: hasSummaries };
  }

  // Last resort fallback also uses FTS limit
  const fallback = await searchProjectFiles(projectId, query, FTS_LIMIT);
  return { files: fallback, method: "fts", useSummaries: false };
}
