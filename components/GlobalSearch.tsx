"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

interface ProjectResult  { id: string; name: string; snippet: string }
interface BlockResult    { id: string; projectId: string; projectName: string; title: string; snippet: string }
interface ConvResult     { id: string; projectId: string; projectName: string; prompt: string; messageIdx: number; role: "user" | "assistant"; snippet: string }

interface Results {
  projects: ProjectResult[];
  blocks: BlockResult[];
  conversations: ConvResult[];
}

type FlatItem =
  | { kind: "project"; data: ProjectResult }
  | { kind: "block";   data: BlockResult }
  | { kind: "conv";    data: ConvResult };

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim() || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const lowerQ = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let idx = lower.indexOf(lowerQ);
  while (idx !== -1) {
    if (idx > lastIdx) parts.push(text.slice(lastIdx, idx));
    parts.push(
      <mark key={idx} className="bg-[#2ee6a6]/25 text-[#2ee6a6] rounded-sm px-0.5 not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    lastIdx = idx + query.length;
    idx = lower.indexOf(lowerQ, lastIdx);
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
}

function flatten(results: Results): FlatItem[] {
  return [
    ...results.projects.map((d): FlatItem => ({ kind: "project", data: d })),
    ...results.blocks.map((d): FlatItem => ({ kind: "block", data: d })),
    ...results.conversations.map((d): FlatItem => ({ kind: "conv", data: d })),
  ];
}

function hrefFor(item: FlatItem): string {
  if (item.kind === "project") return `/projects/${item.data.id}`;
  if (item.kind === "conv") {
    return `/projects/${item.data.projectId}?conv=${item.data.id}&msgIdx=${item.data.messageIdx}`;
  }
  return `/projects/${item.data.projectId}`;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd/Ctrl+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setCursor(0);
    } else {
      setQuery("");
      setResults(null);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setResults(null); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        setResults(json);
        setCursor(0);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const flat = results ? flatten(results) : [];
  const total = flat.length;

  const navigate = useCallback((item: FlatItem) => {
    router.push(hrefFor(item));
    setOpen(false);
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, total - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter" && flat[cursor]) navigate(flat[cursor]);
  }

  const hasResults = results && (results.projects.length + results.blocks.length + results.conversations.length) > 0;

  return (
    <>
      {/* Trigger button in header */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-800 bg-blue-950/60 text-zinc-400 hover:text-zinc-200 hover:border-blue-700 transition-colors text-xs"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span>Search</span>
        <kbd className="ml-1 text-[10px] text-zinc-600 font-mono">⌘K</kbd>
      </button>

      {/* Modal — portalled to document.body so the sticky header's stacking context can't clip it */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-xl bg-[#061f1b] border border-blue-800 rounded-xl shadow-2xl overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-blue-900">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 shrink-0">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search projects, context blocks, conversations…"
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
              />
              {loading && (
                <svg className="animate-spin text-zinc-500 shrink-0" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.22-8.56" />
                </svg>
              )}
              <kbd className="text-[10px] text-zinc-600 font-mono shrink-0">Esc</kbd>
            </div>

            {/* Results */}
            <div className="max-h-[60vh] overflow-y-auto">
              {!results && !loading && query.length < 2 && (
                <p className="px-4 py-8 text-center text-sm text-zinc-600">
                  Type at least 2 characters to search
                </p>
              )}

              {results && !hasResults && (
                <p className="px-4 py-8 text-center text-sm text-zinc-600">
                  No results for &ldquo;{query}&rdquo;
                </p>
              )}

              {hasResults && (() => {
                let globalIdx = 0;
                return (
                  <>
                    {results!.projects.length > 0 && (
                      <Section label="Projects">
                        {results!.projects.map((p) => {
                          const idx = globalIdx++;
                          return (
                            <ResultRow
                              key={p.id}
                              active={cursor === idx}
                              onClick={() => navigate({ kind: "project", data: p })}
                              onMouseEnter={() => setCursor(idx)}
                              icon={<ProjectIcon />}
                              title={highlight(p.name, query)}
                              meta={null}
                              snippet={p.snippet ? highlight(p.snippet, query) : null}
                            />
                          );
                        })}
                      </Section>
                    )}

                    {results!.blocks.length > 0 && (
                      <Section label="Context Blocks">
                        {results!.blocks.map((b) => {
                          const idx = globalIdx++;
                          return (
                            <ResultRow
                              key={b.id}
                              active={cursor === idx}
                              onClick={() => navigate({ kind: "block", data: b })}
                              onMouseEnter={() => setCursor(idx)}
                              icon={<BlockIcon />}
                              title={highlight(b.title, query)}
                              meta={b.projectName}
                              snippet={b.snippet ? highlight(b.snippet, query) : null}
                            />
                          );
                        })}
                      </Section>
                    )}

                    {results!.conversations.length > 0 && (
                      <Section label="Conversations">
                        {results!.conversations.map((c, ri) => {
                          const idx = globalIdx++;
                          const roleBadge = c.role === "user" ? "You" : "Claude";
                          const badgeClass = c.role === "user"
                            ? "text-[10px] px-1.5 py-0.5 rounded bg-blue-800 text-zinc-300"
                            : "text-[10px] px-1.5 py-0.5 rounded bg-[#2ee6a6]/15 text-[#2ee6a6]";
                          return (
                            <ResultRow
                              key={`${c.id}-${c.messageIdx}`}
                              active={cursor === idx}
                              onClick={() => navigate({ kind: "conv", data: c })}
                              onMouseEnter={() => setCursor(idx)}
                              icon={<ConvIcon />}
                              title={
                                <span className="flex items-center gap-2 min-w-0">
                                  <span className="truncate">{highlight(c.prompt, query)}</span>
                                  <span className={`shrink-0 ${badgeClass}`}>{roleBadge}</span>
                                </span>
                              }
                              meta={c.projectName}
                              snippet={c.snippet ? highlight(c.snippet, query) : null}
                            />
                          );
                        })}
                      </Section>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Footer */}
            {hasResults && (
              <div className="px-4 py-2 border-t border-blue-900 flex gap-4 text-[10px] text-zinc-600">
                <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                <span><kbd className="font-mono">↵</kbd> open</span>
                <span><kbd className="font-mono">Esc</kbd> close</span>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-[10px] uppercase tracking-widest text-zinc-600 font-medium">{label}</p>
      {children}
    </div>
  );
}

interface RowProps {
  active: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  icon: React.ReactNode;
  title: React.ReactNode;
  meta: string | null;
  snippet: React.ReactNode | null;
}

function ResultRow({ active, onClick, onMouseEnter, icon, title, meta, snippet }: RowProps) {
  return (
    <button
      onMouseDown={onClick}
      onMouseEnter={onMouseEnter}
      className={`w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors ${active ? "bg-blue-900" : "hover:bg-blue-950"}`}
    >
      <span className={`mt-0.5 shrink-0 ${active ? "text-[#2ee6a6]" : "text-zinc-500"}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm text-zinc-100 truncate">{title}</p>
          {meta && <span className="text-[10px] text-zinc-500 shrink-0">{meta}</span>}
        </div>
        {snippet && (
          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">{snippet}</p>
        )}
      </div>
    </button>
  );
}

function ProjectIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function BlockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function ConvIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
