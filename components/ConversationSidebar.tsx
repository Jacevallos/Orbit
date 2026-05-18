"use client";

import { useState } from "react";
import type { Prompt, ContextBlock } from "@prisma/client";
import { ContextVault } from "./ContextVault";

interface Props {
  projectId: string;
  conversations: Prompt[];
  selectedId: string | null;
  blocks: ContextBlock[];
  onSelect: (id: string) => void;
  onNewConversation: (conv: Prompt) => void;
}

export function ConversationSidebar({
  projectId,
  conversations,
  selectedId,
  blocks,
  onSelect,
  onNewConversation,
}: Props) {
  const [composing, setComposing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includedIds, setIncludedIds] = useState<Set<string>>(
    () => new Set(blocks.map((b) => b.id))
  );

  function toggleBlock(id: string) {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function startConversation() {
    if (!prompt.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrompt: prompt.trim(),
          includedBlockIds: Array.from(includedIds),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      onNewConversation(json.prompt);
      setPrompt("");
      setComposing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* New chat button */}
      <div className="p-3 shrink-0 border-b border-teal-900">
        <button
          onClick={() => { setComposing((v) => !v); setError(null); }}
          className="w-full bg-[#2ee6a6] text-zinc-900 rounded-lg px-3 py-2 text-sm font-medium hover:bg-[#26c98f] transition-colors"
        >
          {composing ? "Cancel" : "+ New Chat"}
        </button>
      </div>

      {/* New chat composer */}
      {composing && (
        <div className="p-3 border-b border-teal-900 space-y-2 shrink-0">
          <textarea
            className="w-full border border-blue-800 rounded-lg px-3 py-2 text-sm bg-[#0f1d3a] text-white placeholder:text-zinc-500 resize-none"
            placeholder="What do you want to ask?"
            rows={3}
            value={prompt}
            autoFocus
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                startConversation();
              }
            }}
          />
          {blocks.length > 0 && (
            <details className="text-xs">
              <summary className="text-zinc-400 cursor-pointer select-none">
                Context blocks ({includedIds.size}/{blocks.length})
              </summary>
              <div className="mt-1.5 space-y-1">
                <li className="flex items-center gap-1.5 list-none">
                  <input
                    type="checkbox"
                    checked={includedIds.size === blocks.length}
                    ref={(el) => { if (el) el.indeterminate = includedIds.size > 0 && includedIds.size < blocks.length; }}
                    onChange={() =>
                      setIncludedIds(
                        includedIds.size === blocks.length
                          ? new Set()
                          : new Set(blocks.map((b) => b.id))
                      )
                    }
                  />
                  <span className="text-zinc-400 font-medium">Select all</span>
                </li>
                <ul className="space-y-1 pl-1">
                  {blocks.map((b) => (
                    <li key={b.id} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={includedIds.has(b.id)}
                        onChange={() => toggleBlock(b.id)}
                      />
                      <span className="text-zinc-300 truncate">{b.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={startConversation}
            disabled={sending || !prompt.trim()}
            className="w-full bg-[#2ee6a6] text-zinc-900 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 hover:bg-[#26c98f] transition-colors"
          >
            {sending ? "Starting…" : "Start Chat"}
          </button>
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && !composing && (
          <p className="text-xs text-zinc-500 p-4">No conversations yet. Start one above.</p>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-4 py-3 border-b border-teal-900/40 transition-colors ${
              selectedId === conv.id
                ? "bg-blue-900 border-l-2 border-l-[#2ee6a6]"
                : "hover:bg-blue-950"
            }`}
          >
            <p className="text-sm text-zinc-200 line-clamp-2 leading-snug">
              {conv.userPrompt}
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              {new Date(conv.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </p>
          </button>
        ))}
      </div>

      {/* Context Vault (collapsible at bottom) */}
      <div className="shrink-0 border-t border-teal-900">
        <details>
          <summary className="px-4 py-2.5 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors select-none uppercase tracking-wide font-medium">
            Context Vault ({blocks.length})
          </summary>
          <div className="px-2 pb-2 max-h-64 overflow-y-auto">
            <ContextVault projectId={projectId} blocks={blocks} />
          </div>
        </details>
      </div>
    </div>
  );
}
