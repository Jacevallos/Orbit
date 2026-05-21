import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function snippet(text: string | null | undefined, query: string, maxLen = 180): string {
  if (!text) return "";
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? "…" : "");
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 120);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

interface RawConv {
  id: string;
  projectId: string;
  userPrompt: string;
  responseText: string | null;
  messages: string;
  projectName: string;
  createdAt: Date;
}

// Return one entry per matching message in the conversation (not one per conversation)
function getMatchingMessages(conv: RawConv, q: string) {
  const lower = q.toLowerCase();
  const results: Array<{ messageIdx: number; content: string; role: string }> = [];

  try {
    const msgs: Array<{ role: string; content: string }> = JSON.parse(conv.messages);
    if (msgs.length > 0) {
      msgs.forEach((msg, idx) => {
        if (typeof msg.content === "string" && msg.content.toLowerCase().includes(lower)) {
          results.push({ messageIdx: idx, content: msg.content, role: msg.role });
        }
      });
      return results;
    }
  } catch {}

  // Fallback for older conversations without a populated messages array
  if (conv.userPrompt.toLowerCase().includes(lower)) {
    results.push({ messageIdx: 0, content: conv.userPrompt, role: "user" });
  }
  if (conv.responseText?.toLowerCase().includes(lower)) {
    results.push({ messageIdx: 1, content: conv.responseText, role: "assistant" });
  }
  return results;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ projects: [], blocks: [], conversations: [] });
  }

  const pattern = `%${q}%`;

  const [projects, blocks, rawConvs] = await Promise.all([
    prisma.project.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { goal: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      orderBy: { updatedAt: "desc" },
    }),

    prisma.contextBlock.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 8,
      include: { project: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),

    prisma.$queryRaw<RawConv[]>`
      SELECT p.id, p."projectId", p."userPrompt", p."responseText",
             p.messages::text AS messages, proj.name AS "projectName", p."createdAt"
      FROM "Prompt" p
      JOIN "Project" proj ON p."projectId" = proj.id
      WHERE p."userPrompt" ILIKE ${pattern}
         OR p."responseText" ILIKE ${pattern}
         OR EXISTS (
           SELECT 1
           FROM jsonb_array_elements(COALESCE(p.messages, '[]'::jsonb)) AS msg
           WHERE msg->>'content' ILIKE ${pattern}
         )
      ORDER BY p."createdAt" DESC
      LIMIT 20
    `,
  ]);

  // Expand each conversation into one result per matching message
  const conversations = rawConvs
    .flatMap((conv) =>
      getMatchingMessages(conv, q).map((match) => ({
        id: conv.id,
        projectId: conv.projectId,
        projectName: conv.projectName,
        prompt: conv.userPrompt,
        messageIdx: match.messageIdx,
        role: match.role as "user" | "assistant",
        snippet: snippet(match.content, q),
      }))
    )
    .slice(0, 20);

  return NextResponse.json({
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      snippet: snippet(p.goal ?? p.description, q),
    })),
    blocks: blocks.map((b) => ({
      id: b.id,
      projectId: b.projectId,
      projectName: b.project.name,
      title: b.title,
      snippet: snippet(b.content, q),
    })),
    conversations,
  });
}
