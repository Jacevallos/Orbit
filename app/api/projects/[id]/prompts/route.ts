import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildPromptPacket, type TaskType } from "@/lib/prompt-packet";
import { runAnthropic, DEFAULT_CLAUDE_MODEL } from "@/lib/anthropic";

interface Params {
  params: { id: string };
}

// POST /api/projects/[id]/prompts
// Body: { userPrompt, taskType?, model?, includedBlockIds? }
//
// If `includedBlockIds` is omitted, all of the project's context blocks are
// included. If it's an array (even empty), only those blocks are used.
export async function POST(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const { userPrompt, taskType, model, includedBlockIds } = body ?? {};

  if (!userPrompt || typeof userPrompt !== "string" || userPrompt.trim().length === 0) {
    return NextResponse.json({ error: "userPrompt is required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { contextBlocks: true },
  });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  // Filter context blocks if a specific selection was passed.
  const selectedBlocks = Array.isArray(includedBlockIds)
    ? project.contextBlocks.filter((b) => includedBlockIds.includes(b.id))
    : project.contextBlocks;

  const { packet, includedBlockIds: actualIncluded } = buildPromptPacket({
    project: { name: project.name, description: project.description, goal: project.goal },
    blocks: selectedBlocks,
    userPrompt,
    taskType: (taskType as TaskType | undefined) ?? null,
  });

  const modelName = typeof model === "string" && model.length > 0 ? model : DEFAULT_CLAUDE_MODEL;

  // Save the prompt row first so we always have a record, even if the API call fails.
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

  // Now actually call the model.
  try {
    const result = await runAnthropic({ model: modelName, prompt: packet });
    const updated = await prisma.prompt.update({
      where: { id: promptRow.id },
      data: {
        responseText: result.text,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
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
