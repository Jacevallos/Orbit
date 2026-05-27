import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { countProjectFiles } from "@/lib/file-search";
import { runAnthropic } from "@/lib/anthropic";
import { logger } from "@/lib/logger";

async function generateFileSummary(path: string, content: string): Promise<string | null> {
  if (content.length < 200) return null; // tiny files don't need a summary
  try {
    const excerpt = content.slice(0, 2_000);
    const result = await runAnthropic({
      model: "claude-haiku-4-5-20251001",
      system: "You write concise 2-sentence file summaries for a code search index. Describe what the file does and its key classes/functions. Be specific and technical.",
      messages: [{ role: "user", content: `Summarize this file (${path}):\n\n${excerpt}` }],
      maxTokens: 120,
    });
    return result.text.trim();
  } catch {
    return null;
  }
}

interface Params {
  params: { id: string };
}

// GET — return count of indexed files for this project
export async function GET(_req: NextRequest, { params }: Params) {
  const count = await countProjectFiles(params.id);
  return NextResponse.json({ count });
}

// POST — batch index files (clears existing index first, then inserts)
export async function POST(req: NextRequest, { params }: Params) {
  const { files } = await req.json();

  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "files array required" }, { status: 400 });
  }

  try {
    await prisma.$executeRaw`
      DELETE FROM "ProjectFile" WHERE "projectId" = ${params.id}
    `;

    // Phase 1: Insert all files immediately (no summaries yet — keeps indexing fast)
    const validFiles = files.filter((f: any) => f.path && typeof f.content === "string");
    for (const file of validFiles) {
      await prisma.$executeRaw`
        INSERT INTO "ProjectFile" (id, "projectId", path, content, "createdAt")
        VALUES (gen_random_uuid()::text, ${params.id}, ${file.path}, ${file.content}, NOW())
      `;
    }
    logger.info("files.indexed", { projectId: params.id, count: validFiles.length });

    // Phase 2: Generate summaries in parallel batches of 10 (Haiku, cheap + fast)
    const toSummarize = validFiles.filter((f: any) => f.content.length >= 200);
    const CONCURRENCY = 10;
    let summarized = 0;
    for (let i = 0; i < toSummarize.length; i += CONCURRENCY) {
      const batch = toSummarize.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (file: any) => {
        const summary = await generateFileSummary(file.path, file.content);
        if (summary) {
          await prisma.$executeRaw`
            UPDATE "ProjectFile" SET summary = ${summary}
            WHERE "projectId" = ${params.id} AND path = ${file.path}
          `;
          summarized++;
        }
      }));
    }

    logger.info("files.summarized", { projectId: params.id, count: summarized });
    return NextResponse.json({ indexed: validFiles.length, summarized });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    logger.error("files.index-failed", { projectId: params.id, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — remove all indexed files for this project
export async function DELETE(_req: NextRequest, { params }: Params) {
  await prisma.$executeRaw`
    DELETE FROM "ProjectFile" WHERE "projectId" = ${params.id}
  `;
  return NextResponse.json({ ok: true });
}
