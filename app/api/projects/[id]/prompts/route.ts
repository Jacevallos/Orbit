import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt, buildPromptPacket, type TaskType } from "@/lib/prompt-packet";
import { runAnthropic, DEFAULT_CLAUDE_MODEL, type FileAttachment, type ContextFileBlock } from "@/lib/anthropic";
import { logger } from "@/lib/logger";
import { smartSearchProjectFiles, buildFileContext, buildSummaryContext, countProjectFiles } from "@/lib/file-search";
import type { ContextBlock } from "@prisma/client";

interface Params {
  params: { id: string };
}

function parseFolderBlock(content: string) {
  try { const p = JSON.parse(content); return p._folder ? p : null; } catch { return null; }
}

function getContextFileBlocks(blocks: ContextBlock[]): ContextFileBlock[] {
  return blocks.flatMap((b) => {
    // Regular image/pdf stored as data URL
    const dataMatch = b.content.match(/^data:([^;,]+);base64,(.+)$/s);
    if (dataMatch) return [{ name: b.title, mediaType: dataMatch[1], data: dataMatch[2] }];
    // Folder block with embedded images
    const folder = parseFolderBlock(b.content);
    if (folder?.images?.length) {
      return folder.images.map((img: any) => ({ name: img.name, mediaType: img.mediaType, data: img.data }));
    }
    return [];
  });
}

function getTextOnlyBlocks(blocks: ContextBlock[]): ContextBlock[] {
  return blocks
    .filter((b) => !b.content.startsWith("data:"))
    .map((b) => {
      const folder = parseFolderBlock(b.content);
      if (!folder) return b;
      // Replace JSON content with readable text for the system prompt
      const desc = folder.description ? `Description: ${folder.description}\n\n` : "";
      return { ...b, content: desc + (folder.textContent || "") };
    });
}

// PostgreSQL rejects null bytes in text columns (error 22021).
// Strip them from any string before it touches the DB or gets sent to Claude.
function stripNullBytes(s: string): string {
  return s.replace(/\x00/g, "");
}

// Truncate at a complete file boundary (--- path ---) rather than slicing mid-file,
// so partial file content doesn't waste context or confuse the model.
function smartTruncate(system: string, maxChars: number): string {
  if (system.length <= maxChars) return system;
  const candidate = system.slice(0, maxChars);
  const lastBoundary = candidate.lastIndexOf("\n\n--- ");
  if (lastBoundary > maxChars * 0.5) {
    return candidate.slice(0, lastBoundary) + "\n\n[Some files omitted — codebase too large to fit entirely in context window]";
  }
  return candidate + "\n\n[Context truncated — too large to include in full]";
}

export async function POST(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const { userPrompt, taskType, model, includedBlockIds, attachments } = body ?? {};

  if (!userPrompt || typeof userPrompt !== "string" || userPrompt.trim().length === 0) {
    return NextResponse.json({ error: "userPrompt is required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { contextBlocks: true },
  });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  const selectedBlocks = Array.isArray(includedBlockIds)
    ? project.contextBlocks.filter((b) => includedBlockIds.includes(b.id))
    : project.contextBlocks;

  const taskTypeParsed = (taskType as TaskType | undefined) ?? null;

  // If project has indexed files, use FTS instead of folder blocks
  const fileCount = await countProjectFiles(project.id);
  const useFileFts = fileCount > 0;

  const blocksForContext = useFileFts
    ? selectedBlocks.filter((b) => !parseFolderBlock(b.content))
    : selectedBlocks;

  const textBlocks = getTextOnlyBlocks(blocksForContext);
  const contextFileBlocks = getContextFileBlocks(selectedBlocks);

  let fileContextStr = "";
  if (useFileFts) {
    const { files, useSummaries } = await smartSearchProjectFiles(project.id, userPrompt, 14);
    if (files.length > 0) {
      fileContextStr = useSummaries
        ? buildSummaryContext(files)
        : buildFileContext(files, { query: userPrompt });
    }
  }

  // Stable system prompt — no file content here so prompt caching always hits.
  let system = buildSystemPrompt(
    { name: project.name, description: project.description, goal: project.goal },
    textBlocks,
    taskTypeParsed,
  );
  system = stripNullBytes(system);
  system = smartTruncate(system, 600_000);
  const { packet, includedBlockIds: actualIncluded } = buildPromptPacket({
    project: { name: project.name, description: project.description, goal: project.goal },
    blocks: textBlocks,
    userPrompt,
    taskType: taskTypeParsed,
  });

  const modelName = typeof model === "string" && model.length > 0 ? model : DEFAULT_CLAUDE_MODEL;
  const userAttachments: FileAttachment[] = Array.isArray(attachments) ? attachments : [];

  const promptRow = await prisma.prompt.create({
    data: {
      projectId: project.id,
      userPrompt: stripNullBytes(userPrompt),
      generatedPacket: stripNullBytes(packet),
      includedBlockIds: actualIncluded,
      modelName,
      taskType: taskType || null,
    },
  });

  logger.info("prompt.start", { projectId: project.id, model: modelName, promptId: promptRow.id });
  try {
    // Files are injected into the user message for the API call only.
    // The stored messages use clean userPrompt so history stays small.
    const apiContent = fileContextStr
      ? `${fileContextStr}\n\n---\n\n${userPrompt}`
      : userPrompt;

    const result = await runAnthropic({
      model: modelName,
      system,
      contextFileBlocks: contextFileBlocks.length > 0 ? contextFileBlocks : undefined,
      messages: [{ role: "user", content: apiContent, attachments: userAttachments.length > 0 ? userAttachments : undefined }],
    });

    const messages = [
      { role: "user", content: userPrompt, attachments: userAttachments.length > 0 ? userAttachments : undefined },
      { role: "assistant", content: result.text },
    ];

    const updated = await prisma.prompt.update({
      where: { id: promptRow.id },
      data: {
        responseText: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        messages,
      },
    });
    // Strip large fields before sending to client — generatedPacket contains the
    // full assembled system prompt and messages duplicates responseText; both can
    // be several MB and cause "Unexpected end of JSON input" on the client.
    logger.info("prompt.complete", { promptId: promptRow.id, inputTokens: result.inputTokens, outputTokens: result.outputTokens, cacheCreation: result.cacheCreationTokens, cacheRead: result.cacheReadTokens });
    const { generatedPacket: _gp, messages: _msgs, ...promptForClient } = updated as any;
    return NextResponse.json({ prompt: promptForClient });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error("prompt.failed", { promptId: promptRow.id, projectId: project.id, error: message });
    const failed = await prisma.prompt.update({
      where: { id: promptRow.id },
      data: { errorMessage: message },
    });
    const { generatedPacket: _gp2, messages: _msgs2, ...failedForClient } = failed as any;
    return NextResponse.json({ prompt: failedForClient, error: message }, { status: 500 });
  }
}
