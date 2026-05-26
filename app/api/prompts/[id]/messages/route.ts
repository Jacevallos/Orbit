import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt, type TaskType } from "@/lib/prompt-packet";
import { runAnthropic, type ChatMessage, type FileAttachment, type ContextFileBlock } from "@/lib/anthropic";
import { logger } from "@/lib/logger";
import type { ContextBlock } from "@prisma/client";

interface Params {
  params: { id: string };
}

function stripNullBytes(s: string): string {
  return s.replace(/\x00/g, "");
}

function smartTruncate(system: string, maxChars: number): string {
  if (system.length <= maxChars) return system;
  const candidate = system.slice(0, maxChars);
  const lastBoundary = candidate.lastIndexOf("\n\n--- ");
  if (lastBoundary > maxChars * 0.5) {
    return candidate.slice(0, lastBoundary) + "\n\n[Some files omitted — codebase too large to fit entirely in context window]";
  }
  return candidate + "\n\n[Context truncated — too large to include in full]";
}

// Cap system prompt — Claude claude-sonnet-4-6 has a 200K token context window.
// 150K chars ≈ 37K tokens, leaving plenty of room for conversation history.
const MAX_SYSTEM_CHARS = 600_000;

function parseFolderBlock(content: string) {
  try { const p = JSON.parse(content); return p._folder ? p : null; } catch { return null; }
}

function getContextFileBlocks(blocks: ContextBlock[]): ContextFileBlock[] {
  return blocks.flatMap((b) => {
    const dataMatch = b.content.match(/^data:([^;,]+);base64,(.+)$/s);
    if (dataMatch) return [{ name: b.title, mediaType: dataMatch[1], data: dataMatch[2] }];
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
      const desc = folder.description ? `Description: ${folder.description}\n\n` : "";
      return { ...b, content: desc + (folder.textContent || "") };
    });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { content, includedBlockIds, attachments } = await req.json();
  if (!content || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const conversation = await prisma.prompt.findUnique({
    where: { id: params.id },
    include: { project: { include: { contextBlocks: true } } },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allBlocks = conversation.project.contextBlocks;
  const blockIds: string[] = Array.isArray(includedBlockIds)
    ? includedBlockIds
    : (conversation.includedBlockIds as string[]);
  const selectedBlocks = blockIds.length > 0
    ? allBlocks.filter((b) => blockIds.includes(b.id))
    : allBlocks;

  const textBlocks = getTextOnlyBlocks(selectedBlocks);
  const contextFileBlocks = getContextFileBlocks(selectedBlocks);
  const userAttachments: FileAttachment[] = Array.isArray(attachments) ? attachments : [];

  let system = buildSystemPrompt(
    { name: conversation.project.name, description: conversation.project.description, goal: conversation.project.goal },
    textBlocks,
    conversation.taskType as TaskType | null,
  );

  system = stripNullBytes(system);
  system = smartTruncate(system, MAX_SYSTEM_CHARS);

  const displayMessages = (conversation.messages as ChatMessage[]) ?? [];
  if (displayMessages.length === 0) {
    if (conversation.userPrompt) displayMessages.push({ role: "user", content: conversation.userPrompt });
    if (conversation.responseText) displayMessages.push({ role: "assistant", content: conversation.responseText });
  }

  const newUserMessage: ChatMessage = {
    role: "user",
    content: content.trim(),
    ...(userAttachments.length > 0 ? { attachments: userAttachments } : {}),
  };

  logger.info("message.start", { promptId: params.id, model: conversation.modelName });
  try {
    const result = await runAnthropic({
      model: conversation.modelName,
      system,
      contextFileBlocks: contextFileBlocks.length > 0 ? contextFileBlocks : undefined,
      messages: [...displayMessages, newUserMessage],
    });

    const updatedMessages: ChatMessage[] = [
      ...displayMessages,
      newUserMessage,
      { role: "assistant", content: result.text },
    ];

    const updated = await prisma.prompt.update({
      where: { id: params.id },
      data: {
        messages: updatedMessages,
        inputTokens: (conversation.inputTokens ?? 0) + result.inputTokens,
        outputTokens: (conversation.outputTokens ?? 0) + result.outputTokens,
      },
    });

    // Return only a lightweight response — NOT the full conversation object.
    // Returning updated.messages (which can be huge with large context history) was
    // causing "Unexpected end of JSON input" on the client due to response body size.
    logger.info("message.complete", { promptId: params.id, inputTokens: result.inputTokens, outputTokens: result.outputTokens, cacheCreation: result.cacheCreationTokens, cacheRead: result.cacheReadTokens });
    return NextResponse.json({
      reply: result.text,
      inputTokens: updated.inputTokens,
      outputTokens: updated.outputTokens,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error("message.failed", { promptId: params.id, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
