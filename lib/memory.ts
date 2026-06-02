import { prisma } from "@/lib/prisma";
import { runAnthropic } from "@/lib/anthropic";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/lib/anthropic";

export interface MemoryEntry {
  id: string;
  content: string;
  createdAt: Date;
}

export async function getProjectMemories(projectId: string): Promise<MemoryEntry[]> {
  const rows = await prisma.$queryRaw<MemoryEntry[]>`
    SELECT id, content, "createdAt"
    FROM "ProjectMemory"
    WHERE "projectId" = ${projectId}
    ORDER BY "createdAt" DESC
    LIMIT 30
  `;
  return rows;
}

// Extract persistent facts from the last user+assistant exchange and store them.
// Called after every other response to avoid over-extraction on rapid back-and-forth.
export async function extractAndStoreMemories(
  projectId: string,
  lastExchange: ChatMessage[],
  existingMemories: string[],
): Promise<void> {
  if (lastExchange.length < 2) return;

  const exchangeText = lastExchange
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 1_200)}`)
    .join("\n\n");

  const existingNote = existingMemories.length > 0
    ? `\n\nAlready stored (do NOT repeat):\n${existingMemories.map((m) => `• ${m}`).join("\n")}`
    : "";

  try {
    const result = await runAnthropic({
      model: "claude-haiku-4-5-20251001",
      system: `You extract persistent technical facts from developer conversations for long-term storage.
Return a JSON array of short strings (max 120 chars each). Only extract:
- Architectural decisions ("decided to use X pattern for Y reason")
- Non-obvious code facts ("Class X must always be initialized before Y")
- Key constraints ("file upload capped at 10MB due to Z")
- Important naming/config facts ("DatabaseChoice setting controls SQLite vs SQL Server mode")
Return [] if nothing is worth saving long-term. Max 4 items per call.
Do NOT extract: questions, temporary debug steps, things obvious from reading the code.`,
      messages: [{
        role: "user",
        content: `Extract memorable facts from this exchange:${existingNote}\n\nExchange:\n${exchangeText}`,
      }],
      maxTokens: 300,
    });

    // Extract a JSON array from anywhere in the response — handles cases where
    // Haiku adds surrounding text instead of returning bare JSON.
    const arrayMatch = result.text.match(/\[[\s\S]*?\]/);
    if (!arrayMatch) return;
    const memories: unknown = JSON.parse(arrayMatch[0]);
    if (!Array.isArray(memories) || memories.length === 0) return;

    for (const memory of memories.slice(0, 4)) {
      if (typeof memory !== "string" || memory.length < 10) continue;
      await prisma.$executeRaw`
        INSERT INTO "ProjectMemory" (id, "projectId", content, "createdAt")
        VALUES (gen_random_uuid()::text, ${projectId}, ${memory.slice(0, 200)}, NOW())
      `;
    }

    logger.info("memory.extracted", { projectId, count: memories.length });
  } catch (err) {
    logger.warn("memory.extract-failed", { projectId, error: String(err) });
  }
}
