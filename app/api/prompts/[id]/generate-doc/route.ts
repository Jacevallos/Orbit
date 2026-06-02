import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAnthropic } from "@/lib/anthropic";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/lib/anthropic";

interface Params {
  params: { id: string };
}

const DOC_CONFIGS: Record<string, { label: string; prompt: string }> = {
  adr: {
    label: "Architecture Decision Record",
    prompt: `Generate an Architecture Decision Record (ADR) from this conversation. Use this exact format:

# ADR: [concise title]

## Context
[What problem or situation led to this decision]

## Decision
[What was decided]

## Rationale
[Why this approach over the alternatives]

## Consequences
[What this means going forward — both positive and any tradeoffs]

Be specific. Reference actual file names, class names, and patterns from the conversation.`,
  },
  onboarding: {
    label: "Onboarding Guide",
    prompt: `Write a practical onboarding guide for a new developer based on this conversation. Cover:
- What this part of the codebase does and why it exists
- Key files and what each one owns
- Non-obvious patterns, conventions, and gotchas
- What to read first

Be specific — reference actual file names and class names from the conversation. Write it like you're the person who built it explaining it to someone new.`,
  },
  runbook: {
    label: "Runbook",
    prompt: `Generate a runbook from this conversation — a step-by-step reference someone can follow. Include:
- What scenario or problem this covers
- Prerequisites / what to check first
- Step-by-step process
- Key files, methods, or settings involved
- How to verify it worked

Format it so someone can follow it under pressure without needing to understand all the context.`,
  },
  notes: {
    label: "Technical Notes",
    prompt: `Generate clean technical notes from this conversation. Pull out:
- Key insights and discoveries
- Decisions made and the reasoning
- Code patterns or approaches that came up
- Any open questions or follow-ups worth tracking

Keep it concise. Scannable bullet points where it makes sense.`,
  },
};

export async function POST(req: NextRequest, { params }: Params) {
  const { docType = "notes" } = await req.json();

  const conversation = await prisma.prompt.findUnique({
    where: { id: params.id },
    include: { project: true },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const messages = (conversation.messages as ChatMessage[]) ?? [];
  if (messages.length < 2) {
    return NextResponse.json(
      { error: "Conversation is too short to generate documentation from." },
      { status: 400 },
    );
  }

  const config = DOC_CONFIGS[docType] ?? DOC_CONFIGS.notes;

  const conversationText = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.slice(0, 2_000)}`)
    .join("\n\n");

  try {
    const result = await runAnthropic({
      model: "claude-sonnet-4-6",
      system: `You generate technical documentation from developer conversations. Be direct and specific — no filler, no preamble. Project: ${conversation.project.name}.${conversation.project.description ? ` ${conversation.project.description}` : ""}`,
      messages: [{
        role: "user",
        content: `${config.prompt}\n\nConversation:\n${conversationText}`,
      }],
      maxTokens: 2_000,
    });

    logger.info("doc.generated", { promptId: params.id, docType });
    return NextResponse.json({ content: result.text, label: config.label });
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed";
    logger.error("doc.failed", { promptId: params.id, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
