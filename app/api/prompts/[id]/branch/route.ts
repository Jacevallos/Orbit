import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ChatMessage } from "@/lib/anthropic";

interface Params {
  params: { id: string };
}

export async function POST(req: NextRequest, { params }: Params) {
  const { messageIdx } = await req.json();
  if (typeof messageIdx !== "number" || messageIdx < 0) {
    return NextResponse.json({ error: "messageIdx is required" }, { status: 400 });
  }

  const source = await prisma.prompt.findUnique({ where: { id: params.id } });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allMessages = (source.messages as ChatMessage[]) ?? [];

  // Reconstruct full history if messages array is empty (old conversations)
  const history: ChatMessage[] = allMessages.length > 0
    ? allMessages
    : [
        ...(source.userPrompt ? [{ role: "user" as const, content: source.userPrompt }] : []),
        ...(source.responseText ? [{ role: "assistant" as const, content: source.responseText }] : []),
      ];

  const sliced = history.slice(0, messageIdx + 1);
  if (sliced.length === 0) {
    return NextResponse.json({ error: "No messages at that index" }, { status: 400 });
  }

  const firstUserMsg = sliced.find((m) => m.role === "user");
  const lastMsg = sliced[sliced.length - 1];
  const responseText = lastMsg.role === "assistant" ? lastMsg.content : null;

  // Create with fields the current Prisma client knows about
  const branch = await prisma.prompt.create({
    data: {
      projectId: source.projectId,
      userPrompt: firstUserMsg?.content ?? source.userPrompt,
      generatedPacket: source.generatedPacket,
      includedBlockIds: source.includedBlockIds,
      modelName: source.modelName,
      taskType: source.taskType,
      messages: sliced,
      responseText,
    },
  });

  // Set branch-tracking columns via raw SQL (Prisma client may not have them yet
  // if it hasn't been regenerated since the schema migration)
  await prisma.$executeRaw`
    UPDATE "Prompt"
    SET "parentPromptId" = ${source.id}, "branchPoint" = ${messageIdx}
    WHERE id = ${branch.id}
  `;

  return NextResponse.json({ prompt: { ...branch, parentPromptId: source.id, branchPoint: messageIdx } });
}
