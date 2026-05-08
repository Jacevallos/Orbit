"use client";

import { useState } from "react";
import type { Prompt } from "@prisma/client";

interface Props {
  prompts: Prompt[];
}

export function PromptHistory({ prompts }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (prompts.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          History
        </h2>
        <p className="text-sm text-zinc-500">No prompts yet.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
        History ({prompts.length})
      </h2>
      <ul className="space-y-2">
        {prompts.map((p) => {
          const open = expanded === p.id;
          return (
            <li
              key={p.id}
              className="border border-zinc-200 rounded-md bg-white"
            >
              <button
                onClick={() => setExpanded(open ? null : p.id)}
                className="w-full text-left px-4 py-3 flex items-baseline justify-between gap-4"
              >
                <span className="font-medium text-sm line-clamp-1">
                  {p.userPrompt}
                </span>
                <span className="text-xs text-zinc-500 shrink-0">
                  {p.modelName} ·{" "}
                  {new Date(p.createdAt).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </button>
              {open && (
                <div className="border-t border-zinc-200 px-4 py-3 space-y-3">
                  {p.errorMessage ? (
                    <div className="text-sm text-red-700 bg-red-50 rounded p-2">
                      Error: {p.errorMessage}
                    </div>
                  ) : (
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Response</div>
                      <pre className="text-sm whitespace-pre-wrap font-sans">
                        {p.responseText || "(empty)"}
                      </pre>
                      {p.inputTokens != null && (
                        <div className="text-xs text-zinc-400 mt-2">
                          {p.inputTokens} in / {p.outputTokens} out tokens
                        </div>
                      )}
                    </div>
                  )}
                  <details>
                    <summary className="text-xs text-zinc-500 cursor-pointer">
                      Show packet sent to model
                    </summary>
                    <pre className="mt-2 text-xs text-zinc-700 bg-zinc-50 rounded p-2 whitespace-pre-wrap font-mono">
                      {p.generatedPacket}
                    </pre>
                  </details>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
