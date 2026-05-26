import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");

const ALLOWED: Record<string, string> = {
  app: path.join(LOG_DIR, "app.log"),
  errors: path.join(LOG_DIR, "errors.log"),
};

function readTail(filePath: string, maxLines = 600): string {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    return lines.slice(-maxLines).join("\n");
  } catch {
    return "";
  }
}

export async function GET(req: NextRequest) {
  const file = new URL(req.url).searchParams.get("file") ?? "app";
  const filePath = ALLOWED[file];
  if (!filePath) return NextResponse.json({ error: "Unknown log file" }, { status: 400 });
  return NextResponse.json({ content: readTail(filePath), file });
}

export async function DELETE(req: NextRequest) {
  const file = new URL(req.url).searchParams.get("file") ?? "app";
  const filePath = ALLOWED[file];
  if (!filePath) return NextResponse.json({ error: "Unknown log file" }, { status: 400 });
  try { fs.writeFileSync(filePath, "", "utf8"); } catch {}
  return NextResponse.json({ ok: true });
}
