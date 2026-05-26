import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAnthropic, DEFAULT_CLAUDE_MODEL } from "@/lib/anthropic";
import { logger } from "@/lib/logger";

interface Params {
  params: { id: string };
}

const SYSTEM_PROMPT = `You are a senior software architect analyzing a codebase. Your job is to generate focused, useful context blocks that will help an AI assistant understand and work with this project.

Generate 3-6 context blocks. Each block should cover ONE specific aspect clearly and concisely.

Choose the most relevant block types from:
- Tech Stack: Languages, frameworks, major libraries and versions
- Architecture: Structure, design patterns, key abstractions
- Key Files & Entry Points: Most important files and how they connect
- Database / Data Models: Schema, models, relationships
- API / Endpoints: Routes and what they do
- Business Logic: Core domain rules, key algorithms
- Development Setup: How to build, run, and test
- Coding Conventions: Naming patterns, style rules, important patterns to follow

Return ONLY valid JSON — no explanation, no markdown, just JSON:
{
  "blocks": [
    {
      "title": "concise specific title",
      "content": "detailed content useful for an AI assistant working on this codebase",
      "tags": ["relevant", "tags"]
    }
  ]
}`;

export async function POST(req: NextRequest, { params }: Params) {
  const { textContent } = await req.json();

  if (!textContent || typeof textContent !== "string" || textContent.trim().length < 50) {
    return NextResponse.json({ error: "Not enough text content to analyze" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const userMessage = `Analyze this codebase for the project "${project.name}" and generate context blocks.\n\n${textContent.slice(0, 600_000)}`;

  logger.info("generate-context.start", { projectId: params.id });
  try {
    const result = await runAnthropic({
      model: DEFAULT_CLAUDE_MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: 16000,
    });

    // Strip any markdown code fences Claude might have added
    const cleaned = result.text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed.blocks)) throw new Error("Invalid response format");

    logger.info("generate-context.complete", { projectId: params.id, blockCount: parsed.blocks.length });
    return NextResponse.json({ blocks: parsed.blocks });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate context";
    logger.error("generate-context.failed", { projectId: params.id, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
