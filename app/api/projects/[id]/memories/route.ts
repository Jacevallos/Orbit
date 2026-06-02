import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProjectMemories } from "@/lib/memory";

interface Params {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const memories = await getProjectMemories(params.id);
  return NextResponse.json({ memories });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await prisma.$executeRaw`
    DELETE FROM "ProjectMemory" WHERE "projectId" = ${params.id}
  `;
  return NextResponse.json({ ok: true });
}
