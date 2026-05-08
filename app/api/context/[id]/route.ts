import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
  params: { id: string };
}

// PATCH /api/context/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const data: {
    title?: string;
    content?: string;
    tags?: string[];
    priority?: number;
  } = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.content === "string") data.content = body.content;
  if (Array.isArray(body.tags))
    data.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
  if (typeof body.priority === "number") data.priority = body.priority;

  const block = await prisma.contextBlock.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ block });
}

// DELETE /api/context/[id]
export async function DELETE(_: NextRequest, { params }: Params) {
  await prisma.contextBlock.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
