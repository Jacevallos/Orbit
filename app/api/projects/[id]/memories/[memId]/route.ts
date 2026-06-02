import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
  params: { id: string; memId: string };
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await prisma.$executeRaw`
    DELETE FROM "ProjectMemory"
    WHERE id = ${params.memId} AND "projectId" = ${params.id}
  `;
  return NextResponse.json({ ok: true });
}
