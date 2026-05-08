import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
  params: { id: string };
}

// POST /api/projects/[id]/context — add a context block.
export async function POST(req: NextRequest, { params }: Params) {
  const body = await req.json();
  const { title, content, tags, priority } = body ?? {};

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Verify the project exists — Prisma will fail with a less helpful message otherwise.
  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project)
    return NextResponse.json({ error: "project not found" }, { status: 404 });

  const block = await prisma.contextBlock.create({
    data: {
      projectId: params.id,
      title: title.trim(),
      content,
      tags: Array.isArray(tags)
        ? tags.map((t: unknown) => String(t).trim()).filter(Boolean)
        : [],
      priority: typeof priority === "number" ? priority : 0,
    },
  });
  return NextResponse.json({ block }, { status: 201 });
}
