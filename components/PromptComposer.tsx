"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ContextBlock } from "@prisma/client";
import { suggestTaskType, type TaskType } from "@/lib/prompt-packet";

interface Props {
  projectId: string;
  blocks: ContextBlock[];
}

const TASK_TYPES: TaskType[] = [
  "coding",
  "research",
  "writing",
  "planning",
  "debugging",
  "summarizing",
];

export function PromptComposer({ projectId, blocks }: Props) {
  const router = useRouter();
  const [userPrompt, setUserPrompt] = useState("");
  const [taskType, setTaskType] = useState<TaskType | "">("");
  const [includedIds, setIncludedIds] = useState<Set<string>>(
    () => new Set(blocks.map((b) => b.id)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whenever blocks change (e.g., user added one), include it by default.
  useEffect(() => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      for (const b of blocks) if (!next.has(b.id)) next.add(b.id);
      return next;
    });
  }, [blocks]);

  // Cheap router suggestion shown above the dropdown.
  const suggested = useMemo(() => suggestTaskType(userPrompt), [userPrompt]);

  function toggle(id: string) {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!userPrompt.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrompt,
          taskType: taskType || null,
          includedBlockIds: Array.from(includedIds),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "request failed");
      setUserPrompt("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        Compose Prompt
      </h2>

      <div className="border border-zinc-200 rounded-md bg-white p-3 space-y-3">
        <textarea
          className="w-full border border-zinc-300 rounded px-2 py-1.5 text-sm"
          placeholder="What do you want to ask? The selected context will be bundled in automatically."
          rows={5}
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
        />

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-zinc-500">Task:</label>
          <select
            className="border border-zinc-300 rounded px-2 py-1 text-sm"
            value={taskType}
            onChange={(e) => setTaskType(e.target.value as TaskType | "")}
          >
            <option value="">— none —</option>
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {suggested && taskType !== suggested && (
            <button
              onClick={() => setTaskType(suggested)}
              className="text-xs text-zinc-500 hover:text-zinc-900 underline"
            >
              suggestion: {suggested}
            </button>
          )}
        </div>

        {blocks.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-xs text-zinc-500">
              Context blocks included ({includedIds.size}/{blocks.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={includedIds.has(b.id)}
                    onChange={() => toggle(b.id)}
                  />
                  <span className="text-sm">{b.title}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={send}
            disabled={submitting || !userPrompt.trim()}
            className="bg-zinc-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Send to Claude"}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>
    </section>
  );
}
