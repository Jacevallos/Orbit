// The prompt packet generator.
// Given a project, its context blocks, and a user prompt, assemble a clean
// prompt that puts the model in the right headspace before it sees the question.
//
// Design choices:
// - Plain-text section headers, not XML or Markdown frills. Both Claude and GPT
//   handle this well, and it stays human-readable so the user can copy it
//   into another tool if they want.
// - Context blocks ordered by priority desc, then createdAt asc. Highest-
//   priority context appears first and "anchors" the model.
// - Task type appears as a hint, not a hard mode. If unset, we leave it out.
// - We keep the user prompt at the END so it's the last thing the model reads.

import type { ContextBlock, Project } from "@prisma/client";

export type TaskType =
  | "coding"
  | "research"
  | "writing"
  | "planning"
  | "debugging"
  | "summarizing";

export interface BuildPacketInput {
  project: Pick<Project, "name" | "description" | "goal">;
  blocks: ContextBlock[]; // already filtered/selected by caller
  userPrompt: string;
  taskType?: TaskType | null;
}

export interface BuildPacketResult {
  packet: string;
  includedBlockIds: string[];
}

const TASK_HINTS: Record<TaskType, string> = {
  coding:
    "Focus on correctness and clarity. Show code in the project's existing style. Explain non-obvious choices briefly.",
  research:
    "Prioritize accuracy and cite sources where relevant. Flag claims you're uncertain about.",
  writing:
    "Match the user's voice if shown in context. Prefer plain language over jargon.",
  planning:
    "Lay out concrete steps. Distinguish must-haves from nice-to-haves. Identify the riskiest unknowns.",
  debugging:
    "Form hypotheses about root cause before proposing fixes. State which evidence supports each hypothesis.",
  summarizing:
    "Lead with the single most important point. Be ruthless about cutting filler.",
};

// Builds just the context/system portion (no user question) — used for multi-turn chats.
export function buildSystemPrompt(
  project: Pick<Project, "name" | "description" | "goal">,
  blocks: ContextBlock[],
  taskType?: TaskType | null,
  memories?: string[],
): string {
  const ordered = [...blocks].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const sections: string[] = [];
  sections.push(`PROJECT: ${project.name}`);
  if (project.description) sections.push(`DESCRIPTION: ${project.description}`);
  if (project.goal) sections.push(`GOAL: ${project.goal}`);

  if (memories && memories.length > 0) {
    sections.push(`PROJECT MEMORY (facts learned from past conversations):\n${memories.map((m) => `• ${m}`).join("\n")}`);
  }

  if (ordered.length > 0) {
    sections.push("CONTEXT:");
    for (const block of ordered) {
      const tagSuffix = block.tags.length > 0 ? ` [${block.tags.join(", ")}]` : "";
      sections.push(`--- ${block.title}${tagSuffix} ---\n${block.content}`);
    }
  }

  if (taskType && TASK_HINTS[taskType]) {
    sections.push(`APPROACH: ${TASK_HINTS[taskType]}`);
  }

  sections.push("RESPONSE STYLE: Be concise and direct. Answer exactly what was asked — no preamble, no restating the question, no closing summary. Prefer short code snippets over long prose explanations. If a detailed breakdown is needed, use it; otherwise keep it tight.");

  return sections.join("\n\n");
}

export function buildPromptPacket(input: BuildPacketInput): BuildPacketResult {
  const { project, blocks, userPrompt, taskType } = input;

  // Sort: priority desc, then createdAt asc as a stable tiebreaker.
  const ordered = [...blocks].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  const sections: string[] = [];

  // Project header
  sections.push(`PROJECT: ${project.name}`);
  if (project.description) sections.push(`DESCRIPTION: ${project.description}`);
  if (project.goal) sections.push(`GOAL: ${project.goal}`);

  // Context blocks
  if (ordered.length > 0) {
    sections.push("CONTEXT:");
    for (const block of ordered) {
      const tagSuffix =
        block.tags.length > 0 ? ` [${block.tags.join(", ")}]` : "";
      sections.push(`--- ${block.title}${tagSuffix} ---\n${block.content}`);
    }
  }

  // Task hint
  if (taskType && TASK_HINTS[taskType]) {
    sections.push(`APPROACH: ${TASK_HINTS[taskType]}`);
  }

  // User question goes last so it's freshest in the model's attention.
  sections.push(`REQUEST:\n${userPrompt}`);

  return {
    packet: sections.join("\n\n"),
    includedBlockIds: ordered.map((b) => b.id),
  };
}

// Tiny rule-based router. Returns a suggestion only — never overrides user choice.
// We'll replace this with an LLM classifier later, once we have data.
export function suggestTaskType(userPrompt: string): TaskType | null {
  const p = userPrompt.toLowerCase();
  if (/\b(debug|error|stack ?trace|exception|crash|bug)\b/.test(p))
    return "debugging";
  if (/\b(code|function|class|refactor|implement|api)\b/.test(p))
    return "coding";
  if (/\b(latest|compare|research|market|sources?|cite)\b/.test(p))
    return "research";
  if (/\b(rewrite|email|cover ?letter|resume|edit|tone)\b/.test(p))
    return "writing";
  if (/\b(plan|roadmap|strategy|architect|design the)\b/.test(p))
    return "planning";
  if (/\b(summari[sz]e|tldr|tl;dr|key points)\b/.test(p)) return "summarizing";
  return null;
}
