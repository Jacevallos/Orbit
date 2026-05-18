import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt, type TaskType } from "@/lib/prompt-packet";
import { runAnthropic, type ChatMessage, type FileAttachment, type ContextFileBlock } from "@/lib/anthropic";
import type { ContextBlock } from "@prisma/client";

interface Params {
  params: { id: string };
}

function getContextFileBlocks(blocks: ContextBlock[]): ContextFileBlock[] {
  return blocks.flatMap((b) => {
    const match = b.content.match(/^data:([^;,]+);base64,(.+)$/s);
    if (!match) return [];
    return [{ name: b.title, mediaType: match[1], data: match[2] }];
  });
}

function getTextOnlyBlocks(blocks: ContextBlock[]): ContextBlock[] {
  return blocks.filter((b) => !b.content.startsWith("data:"));
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

  const system = buildSystemPrompt(
    { name: conversation.project.name, description: conversation.project.description, goal: conversation.project.goal },
    textBlocks,
    conversation.taskType as TaskType | null,
  );

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

    return NextResponse.json({ conversation: updated, reply: result.text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
