"use client";

import { useState, useEffect } from "react";

interface Memory {
  id: string;
  content: string;
  createdAt: string;
}

export function MemoryPanel({ projectId }: { projectId: string }) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/memories`)
      .then((r) => r.json())
      .then((d) => { setMemories(d.memories ?? []); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [projectId]);

  async function deleteMemory(id: string) {
    await fetch(`/api/projects/${projectId}/memories/${id}`, { method: "DELETE" });
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  async function clearAll() {
    await fetch(`/api/projects/${projectId}/memories`, { method: "DELETE" });
    setMemories([]);
  }

  if (!loaded || memories.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-teal-900">
      <details>
        <summary className="px-4 py-2.5 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors select-none uppercase tracking-wide font-medium flex items-center justify-between">
          <span>Project Memory</span>
          <span className="normal-case tracking-normal font-normal text-zinc-500">{memories.length}</span>
        </summary>
        <div className="px-3 pb-3 space-y-1.5">
          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
            {memories.map((m) => (
              <div
                key={m.id}
                className="group flex items-start gap-2 bg-blue-950/60 border border-blue-900/40 rounded-md px-2.5 py-1.5"
              >
                <span className="flex-1 text-[11px] text-zinc-400 leading-relaxed">{m.content}</span>
                <button
                  onClick={() => deleteMemory(m.id)}
                  title="Forget this"
                  className="shrink-0 mt-0.5 text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {memories.length > 1 && (
            <button
              onClick={clearAll}
              className="text-[10px] text-zinc-700 hover:text-red-400 transition-colors"
            >
              Clear all memories
            </button>
          )}
        </div>
      </details>
    </div>
  );
}
