"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ContextBlock } from "@prisma/client";

interface Props {
  projectId: string;
  blocks: ContextBlock[];
}

export function ContextVault({ projectId, blocks }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function add() {
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("failed");
      setTitle("");
      setContent("");
      setTags("");
      setAdding(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this context block?")) return;
    await fetch(`/api/context/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
          Context Vault ({blocks.length})
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          {adding ? "Cancel" : "+ Add"}
        </button>
      </div>

      {adding && (
        <div className="border border-blue-900 rounded-md bg-blue-950 p-3 space-y-2">
          <input
            className="w-full border border-blue-800 rounded px-2 py-1.5 text-sm bg-[#0f1d3a] text-zinc-100 placeholder:text-teal-600"
            placeholder="Title (e.g. Tech stack, Bug description, My resume)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            placeholder="Content..."
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <input
            className="w-full border border-blue-800 rounded px-2 py-1.5 text-sm bg-[#0f1d3a] text-zinc-100 placeholder:text-teal-600"
            placeholder="Tags, comma-separated (e.g. coding, debugging)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
          <button
            onClick={add}
            disabled={submitting || !title.trim() || !content.trim()}
            className="bg-[#2ee6a6] text-zinc-900 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-[#26c98f] transition-colors"
          >
            {submitting ? "Saving…" : "Save block"}
          </button>
        </div>
      )}

      <ul className="space-y-2">
        {blocks.length === 0 && !adding && (
          <li className="text-sm text-zinc-500">
            No context yet. Add the project description, your tech stack, the
            bug you're tracking, anything you'd otherwise re-paste each time.
          </li>
        )}
        {blocks.map((b) => (
          <li
            key={b.id}
            className="border border-blue-900 rounded-md bg-blue-950 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm">{b.title}</div>
              <button
                onClick={() => remove(b.id)}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            </div>
            {b.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {b.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] uppercase tracking-wide text-blue-200 bg-blue-900 rounded px-1.5 py-0.5"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            <pre className="mt-2 text-xs text-zinc-300 whitespace-pre-wrap font-sans line-clamp-4">
              {b.content}
            </pre>
          </li>
        ))}
      </ul>
    </section>
  );
}
