import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt, type TaskType } from "@/lib/prompt-packet";
import { runAnthropic, type ChatMessage, type FileAttachment, type ContextFileBlock } from "@/lib/anthropic";
import { logger } from "@/lib/logger";
import { smartSearchProjectFiles, buildFileContext, buildSummaryContext, countProjectFiles } from "@/lib/file-search";
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

// Extract code identifiers and file names from recent conversation messages.
// Appended to vague follow-up queries so FTS/Haiku can find the right files
// even when the user types "implement this" or "is there another way?".
function buildConversationQueryHint(messages: ChatMessage[], maxMessages = 8): string {
  if (messages.length === 0) return "";
  const text = messages
    .slice(-maxMessages)
    .map((m) => m.content.slice(0, 1_200))
    .join(" ");

  // File names (e.g. StatsSaver.cs, MainVM.cs)
  const fileNames = [...text.matchAll(/\b[\w/\\-]+\.(cs|ts|js|tsx|jsx|py|java|cpp|h|go|rs|sql)\b/gi)]
    .map((m) => m[0].split(/[/\\]/).pop()!.replace(/\.\w+$/, ""));

  // PascalCase identifiers (BackupSQLiteToSQLServer, MainViewModel)
  const pascalCase = [...text.matchAll(/\b[A-Z][a-z]+(?:[A-Z][a-z0-9]*)+\b/g)]
    .map((m) => m[0]);

  const terms = [...new Set([...fileNames, ...pascalCase])].slice(0, 10);
  return terms.join(" ");
}

// Compress old conversation history with a Haiku summary when it gets too long.
// Only the messages sent to Claude are compressed — stored history stays intact.
const SUMMARY_THRESHOLD = 14; // message count before compressing
const KEEP_RECENT = 8;        // always keep the latest N messages verbatim

async function maybeSummarize(messages: ChatMessage[]): Promise<ChatMessage[]> {
  if (messages.length <= SUMMARY_THRESHOLD) return messages;

  const toCompress = messages.slice(0, messages.length - KEEP_RECENT);
  const keepRecent = messages.slice(messages.length - KEEP_RECENT);

  const historyText = toCompress
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 600)}`)
    .join("\n\n");

  try {
    const result = await runAnthropic({
      model: "claude-haiku-4-5-20251001",
      system: "You summarize conversations for an AI assistant. Extract key facts, code decisions, file names, and conclusions as 3–6 concise bullet points. Skip small talk.",
      messages: [{ role: "user", content: `Summarize these ${toCompress.length} earlier messages:\n\n${historyText}` }],
      maxTokens: 512,
    });

    // Inject as a user/assistant pair so Claude sees it as prior context
    return [
      { role: "user", content: `[Earlier conversation — ${toCompress.length} messages compressed]\n${result.text}` },
      { role: "assistant", content: "Understood, I have context from the earlier conversation." },
      ...keepRecent,
    ];
  } catch (err) {
    logger.warn("summarize.failed", { error: String(err) });
    return messages;
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { content, includedBlockIds, attachments, fileIds, model } = await req.json();
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

  // If project has indexed files, use FTS instead of folder blocks
  const fileCount = await countProjectFiles(conversation.projectId);
  const useFileFts = fileCount > 0;

  const blocksForContext = useFileFts
    ? selectedBlocks.filter((b) => !parseFolderBlock(b.content))
    : selectedBlocks;

  const textBlocks = getTextOnlyBlocks(blocksForContext);
  const contextFileBlocks = getContextFileBlocks(selectedBlocks);
  const userAttachments: FileAttachment[] = Array.isArray(attachments) ? attachments : [];

  const displayMessages = (conversation.messages as ChatMessage[]) ?? [];
  if (displayMessages.length === 0) {
    if (conversation.userPrompt) displayMessages.push({ role: "user", content: conversation.userPrompt });
    if (conversation.responseText) displayMessages.push({ role: "assistant", content: conversation.responseText });
  }

  // Retrieve relevant files: use explicitly selected fileIds or auto-FTS
  let fileContextStr = "";
  let retrievedCount = 0;
  if (useFileFts) {
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      // Explicit file selection from UI — always full content + chunking
      const explicit = await prisma.$queryRaw<{ path: string; content: string; summary?: string | null }[]>`
        SELECT path, content, summary FROM "ProjectFile"
        WHERE id = ANY(${fileIds}::text[]) AND "projectId" = ${conversation.projectId}
      `;
      if (explicit.length > 0) {
        fileContextStr = buildFileContext(explicit, { query: content });
        retrievedCount = explicit.length;
      }
    } else {
      // Enrich vague follow-up queries ("implement this", "another way?") with
      // identifiers from recent messages so FTS finds the right files.
      const hint = buildConversationQueryHint(displayMessages);
      const searchQuery = hint ? `${content.trim()} ${hint}` : content.trim();

      const { files, useSummaries } = await smartSearchProjectFiles(conversation.projectId, searchQuery, 14);
      if (files.length > 0) {
        fileContextStr = useSummaries
          ? buildSummaryContext(files)
          : buildFileContext(files, { query: content });
        retrievedCount = files.length;
      }
    }
  }

  // System prompt contains only stable content (project info + generated context blocks).
  // This never changes between messages so prompt caching reliably hits every turn.
  let system = buildSystemPrompt(
    { name: conversation.project.name, description: conversation.project.description, goal: conversation.project.goal },
    textBlocks,
    conversation.taskType as TaskType | null,
  );
  system = stripNullBytes(system);
  system = smartTruncate(system, MAX_SYSTEM_CHARS);

  // Files are prepended to the API message only — not stored in DB history.
  // This keeps conversation history small and the system prompt stable for caching.
  const apiContent = fileContextStr
    ? `${fileContextStr}\n\n---\n\n${content.trim()}`
    : content.trim();

  const apiUserMessage: ChatMessage = {
    role: "user",
    content: apiContent,
    ...(userAttachments.length > 0 ? { attachments: userAttachments } : {}),
  };

  // Clean message stored in history (no file dump — files are re-fetched each turn)
  const storedUserMessage: ChatMessage = {
    role: "user",
    content: content.trim(),
    ...(userAttachments.length > 0 ? { attachments: userAttachments } : {}),
  };

  const modelToUse = typeof model === "string" && model.length > 0 ? model : conversation.modelName;

  // Compress old history for the API call when the conversation grows long.
  // displayMessages is kept intact for DB storage; messagesForApi may be shorter.
  const messagesForApi = displayMessages.length > SUMMARY_THRESHOLD
    ? await maybeSummarize(displayMessages)
    : displayMessages;

  logger.info("message.start", { promptId: params.id, model: modelToUse, historyLen: displayMessages.length, apiHistoryLen: messagesForApi.length });
  try {
    const result = await runAnthropic({
      model: modelToUse,
      system,
      contextFileBlocks: contextFileBlocks.length > 0 ? contextFileBlocks : undefined,
      messages: [...messagesForApi, apiUserMessage],
    });

    const updatedMessages: ChatMessage[] = [
      ...displayMessages,
      storedUserMessage,
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
    logger.info("message.complete", { promptId: params.id, inputTokens: result.inputTokens, outputTokens: result.outputTokens, cacheCreation: result.cacheCreationTokens, cacheRead: result.cacheReadTokens, retrievedFiles: retrievedCount });
    return NextResponse.json({
      reply: result.text,
      inputTokens: updated.inputTokens,
      outputTokens: updated.outputTokens,
      retrievedFiles: retrievedCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    logger.error("message.failed", { promptId: params.id, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
