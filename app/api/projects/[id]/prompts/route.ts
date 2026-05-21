import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSystemPrompt, buildPromptPacket, type TaskType } from "@/lib/prompt-packet";
import { runAnthropic, DEFAULT_CLAUDE_MODEL, type FileAttachment, type ContextFileBlock } from "@/lib/anthropic";
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
  const textBlocks = getTextOnlyBlocks(selectedBlocks);
  const contextFileBlocks = getContextFileBlocks(selectedBlocks);

  let system = buildSystemPrompt(
    { name: project.name, description: project.description, goal: project.goal },
    textBlocks,
    taskTypeParsed,
  );
  if (system.length > 150_000) {
    system = system.slice(0, 150_000) + "\n\n[Context truncated — too large to include in full]";
  }
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
      userPrompt,
      generatedPacket: packet,
      includedBlockIds: actualIncluded,
      modelName,
      taskType: taskType || null,
    },
  });

  try {
    const result = await runAnthropic({
      model: modelName,
      system,
      contextFileBlocks: contextFileBlocks.length > 0 ? contextFileBlocks : undefined,
      messages: [{ role: "user", content: userPrompt, attachments: userAttachments.length > 0 ? userAttachments : undefined }],
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
    return NextResponse.json({ prompt: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    const failed = await prisma.prompt.update({
      where: { id: promptRow.id },
      data: { errorMessage: message },
    });
    return NextResponse.json({ prompt: failed, error: message }, { status: 500 });
  }
}
