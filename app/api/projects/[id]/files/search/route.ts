import { NextRequest, NextResponse } from "next/server";
import { searchProjectFiles, countProjectFiles } from "@/lib/file-search";

interface Params {
  params: { id: string };
}

export async function GET(req: NextRequest, { params }: Params) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "15", 10), 30);

  const [files, total] = await Promise.all([
    searchProjectFiles(params.id, q, limit),
    countProjectFiles(params.id),
  ]);

  return NextResponse.json({
    files: files.map((f) => ({ id: f.id, path: f.path, excerpt: f.excerpt })),
    total,
    hasFiles: total > 0,
  });
}
