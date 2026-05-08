import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/projects — list all projects, newest first.
export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { contextBlocks: true, prompts: true } },
    },
  });
  return NextResponse.json({ projects });
}

// POST /api/projects — create a project.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, goal } = body ?? {};

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      goal: goal?.trim() || null,
    },
  });
  return NextResponse.json({ project }, { status: 201 });
}
