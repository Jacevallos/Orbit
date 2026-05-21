"use client";

import { useState, useEffect, useRef } from "react";
import type { Prompt, ContextBlock } from "@prisma/client";
import { ContextVault } from "./ContextVault";
import { formatTokens } from "@/lib/tokens";

interface Props {
  projectId: string;
  conversations: Prompt[];
  selectedId: string | null;
  blocks: ContextBlock[];
  onSelect: (id: string) => void;
  onNewConversation: (conv: Prompt) => void;
  onDelete: (id: string) => void;
}

function TokenUsagePanel({ conversations }: { conversations: Prompt[] }) {
  const tracked = conversations.filter((c) => c.inputTokens != null);
  if (tracked.length === 0) return null;

  const totalInput = tracked.reduce((s, c) => s + (c.inputTokens ?? 0), 0);
  const totalOutput = tracked.reduce((s, c) => s + (c.outputTokens ?? 0), 0);
  const total = totalInput + totalOutput;

  // Visual bar: 200K is Claude's context window size, use as reference
  const WINDOW = 200_000;
  const pct = Math.min(100, Math.round((total / WINDOW) * 100));

  return (
    <div className="shrink-0 border-t border-teal-900">
      <details>
        <summary className="px-4 py-2.5 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors select-none uppercase tracking-wide font-medium flex items-center justify-between">
          <span>Token Usage</span>
          <span className="normal-case tracking-normal font-normal text-zinc-500">{formatTokens(total)}</span>
        </summary>
        <div className="px-4 pb-3 space-y-2.5">
          {/* Bar */}
          <div className="h-1.5 rounded-full bg-blue-900 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-[#2ee6a6]"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Numbers */}
          <div className="flex justify-between text-[11px]">
            <span className="text-zinc-500">{formatTokens(totalInput)} in</span>
            <span className="text-zinc-600">{formatTokens(totalOutput)} out</span>
          </div>
          {/* Rate limit tip */}
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            429 errors mean you&apos;ve exceeded the token rate limit for your API tier.
            Wait ~60s and retry — limits reset per minute.
          </p>
        </div>
      </details>
    </div>
  );
}

export function ConversationSidebar({
  projectId,
  conversations,
  selectedId,
  blocks,
  onDelete,
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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function deleteConversation(id: string) {
    await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    setMenuOpenId(null);
    onDelete(id);
  }

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
      <div className="px-3 shrink-0 border-b border-teal-900 h-14 flex items-center">
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
          <div
            key={conv.id}
            className={`group relative border-b border-teal-900/40 transition-colors ${
              selectedId === conv.id
                ? "bg-blue-900 border-l-2 border-l-[#2ee6a6]"
                : "hover:bg-blue-950"
            }`}
          >
            {/* Clickable area */}
            <button
              onClick={() => onSelect(conv.id)}
              className="w-full text-left px-4 py-3 pr-8"
            >
              <div className="flex items-start gap-1.5">
                {(conv as any).parentPromptId && (
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-1 text-[#2ee6a6]/70">
                    <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/>
                    <path d="M6 9v6"/><path d="M18 9a9 9 0 0 1-9 9"/>
                  </svg>
                )}
                <p className="text-sm text-zinc-200 line-clamp-2 leading-snug">
                  {conv.userPrompt}
                </p>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-zinc-500">
                  {new Date(conv.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                {conv.inputTokens != null && (
                  <p className="text-[10px] text-zinc-600">
                    {formatTokens((conv.inputTokens ?? 0) + (conv.outputTokens ?? 0))} tok
                  </p>
                )}
              </div>
            </button>

            {/* Three-dots button */}
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === conv.id ? null : conv.id); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-zinc-500 hover:text-zinc-200 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {menuOpenId === conv.id && (
              <div
                ref={menuRef}
                className="absolute right-2 top-10 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1 min-w-[120px]"
              >
                <button
                  onClick={() => deleteConversation(conv.id)}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-700 hover:text-red-300 transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Token Usage */}
      <TokenUsagePanel conversations={conversations} />

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
