import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
  params: { id: string };
}

// GET /api/projects/[id] — full project with context blocks and prompts.
export async function GET(_: NextRequest, { params }: Params) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      contextBlocks: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] },
      prompts: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!project)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ project });
}

// PATCH /api/projects/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const data: { name?: string; description?: string | null; goal?: string | null } = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if ("description" in body) data.description = body.description?.trim() || null;
  if ("goal" in body) data.goal = body.goal?.trim() || null;

  const project = await prisma.project.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ project });
}

// DELETE /api/projects/[id]
export async function DELETE(_: NextRequest, { params }: Params) {
  await prisma.project.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
