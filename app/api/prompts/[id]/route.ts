import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
  params: { id: string };
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  await prisma.prompt.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
