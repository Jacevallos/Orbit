"use client";

import { useState } from "react";
import type { Prompt } from "@prisma/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  prompts: Prompt[];
}

export function PromptHistory({ prompts }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (prompts.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
          History
        </h2>
        <p className="text-sm text-zinc-500">No prompts yet.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
        History ({prompts.length})
      </h2>
      <ul className="space-y-2">
        {prompts.map((p) => {
          const open = expanded === p.id;
          return (
            <li
              key={p.id}
              className="border border-blue-900 rounded-lg bg-blue-950 shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setExpanded(open ? null : p.id)}
                className="w-full text-left px-4 py-3 flex items-baseline justify-between gap-4 hover:bg-blue-900 transition-colors"
              >
                <span className="font-medium text-sm line-clamp-1 text-zinc-100">
                  {p.userPrompt}
                </span>
                <span className="text-xs text-zinc-500 shrink-0 flex items-center gap-1.5">
                  <span>{p.modelName}</span>
                  <span className="text-zinc-700">·</span>
                  <span>
                    {new Date(p.createdAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className="text-zinc-700 ml-1">{open ? "▲" : "▼"}</span>
                </span>
              </button>

              {open && (
                <div className="border-t border-blue-900 bg-[#0f1d3a]/60">
                  {p.errorMessage ? (
                    <div className="px-5 py-4">
                      <div className="text-sm text-red-400 bg-red-950/50 rounded-md p-3 border border-red-900">
                        {p.errorMessage}
                      </div>
                    </div>
                  ) : (
                    <div className="px-5 py-5 space-y-4">
                      <div className="prose prose-invert prose-sm max-w-none
                        prose-headings:font-semibold
                        prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                        prose-headings:mt-5 prose-headings:mb-2
                        prose-p:leading-relaxed prose-p:text-zinc-300
                        prose-li:text-zinc-300
                        prose-strong:text-zinc-100
                        prose-code:text-zinc-200 prose-code:bg-[#0f1d3a] prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.8em] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                        prose-pre:bg-[#0f1d3a] prose-pre:border prose-pre:border-blue-900 prose-pre:text-zinc-100 prose-pre:rounded-lg prose-pre:text-xs
                        prose-blockquote:border-l-zinc-600 prose-blockquote:text-zinc-400
                        prose-hr:border-zinc-700
                        prose-table:text-sm
                        prose-th:text-zinc-200 prose-th:bg-blue-950
                        prose-td:text-zinc-300
                        prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {p.responseText || "*(empty)*"}
                        </ReactMarkdown>
                      </div>

                      {p.inputTokens != null && (
                        <div className="text-xs text-zinc-500 pt-3 border-t border-blue-900">
                          {p.inputTokens.toLocaleString()} in · {p.outputTokens?.toLocaleString()} out tokens
                        </div>
                      )}
                    </div>
                  )}

                  <details className="border-t border-blue-900">
                    <summary className="px-5 py-2.5 text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 hover:bg-blue-900/50 transition-colors select-none">
                      Show packet sent to model
                    </summary>
                    <pre className="mx-5 mb-4 mt-2 text-xs text-zinc-300 bg-[#0f1d3a] border border-blue-900 rounded-lg p-4 whitespace-pre-wrap font-mono overflow-x-auto">
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
