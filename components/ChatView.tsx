"use client";

import { useState, useRef, useEffect, memo, useCallback } from "react";
import type { Prompt, ContextBlock } from "@prisma/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import type { ChatMessage, FileAttachment } from "@/lib/anthropic";
import { estimateMessageTokens, estimateCost, formatCost, formatTokens, tokenColorClass } from "@/lib/tokens";
import { ErrorToast } from "@/components/ErrorToast";
import { AVAILABLE_MODELS } from "@/lib/models";

const codeStyle = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...(oneDark as Record<string, React.CSSProperties>)['pre[class*="language-"]'],
    background: "#0a1628",
    margin: 0,
    borderRadius: "0.5rem",
    padding: "1rem",
    fontSize: "0.75rem",
    lineHeight: "1.6",
  },
  'code[class*="language-"]': {
    ...(oneDark as Record<string, React.CSSProperties>)['code[class*="language-"]'],
    background: "transparent",
    fontSize: "0.75rem",
  },
};

type PendingAttachment = FileAttachment & { preview: string | null };

const markdownComponents = {
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    return match ? (
      <CodeBlock language={match[1]} code={String(children).replace(/\n$/, "")} />
    ) : (
      <code className="bg-transparent text-[#2ee6a6] text-[0.9em] font-mono" {...props}>
        {children}
      </code>
    );
  },
};

function BranchButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Fork conversation here"
      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-[#2ee6a6] hover:bg-[#2ee6a6]/10"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rotate-180">
        <circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/>
        <path d="M6 9v6"/><path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      title={copied ? "Copied!" : "Copy message"}
      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-blue-800"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

const MessageBubble = memo(function MessageBubble({
  msg, isTarget, index, onBranch,
}: {
  msg: ChatMessage;
  isTarget?: boolean;
  index: number;
  onBranch: (idx: number) => void;
}) {
  const [ring, setRing] = useState(!!isTarget);
  useEffect(() => {
    if (!isTarget) return;
    const t = setTimeout(() => setRing(false), 2800);
    return () => clearTimeout(t);
  }, [isTarget]);
  const ringClass = ring ? "ring-2 ring-[#2ee6a6]/60" : "ring-0";

  if (msg.role === "user") {
    return (
      <div className="flex flex-col items-end group">
        <div className={`max-w-[75%] bg-blue-900 border border-blue-800 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-zinc-100 transition-all duration-700 ${ringClass}`}>
          {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
          {msg.attachments?.map((att, j) => (
            <div key={j} className="mt-2">
              {att.mediaType.startsWith("image/") ? (
                <img src={`data:${att.mediaType};base64,${att.data}`} alt={att.name} className="max-h-48 rounded-lg object-contain" />
              ) : (
                <div className="flex items-center gap-1.5 bg-blue-800/60 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300">
                  <span>{att.mediaType === "application/pdf" ? "📄" : "📝"}</span>
                  <span className="truncate max-w-[200px]">{att.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-0.5">
          <CopyButton text={msg.content} />
          <BranchButton onClick={() => onBranch(index)} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start group">
      <div className={`max-w-[85%] bg-blue-950 border border-blue-900 rounded-2xl rounded-tl-sm px-5 py-3 transition-all duration-700 ${ringClass}`}>
        <div className="prose prose-invert prose-base max-w-none
          prose-p:text-zinc-300 prose-p:leading-relaxed prose-p:my-1
          prose-headings:text-zinc-100 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1
          prose-li:text-zinc-300 prose-strong:text-zinc-100
          prose-pre:bg-transparent prose-pre:p-0 prose-pre:rounded-lg
          prose-blockquote:border-l-blue-700 prose-blockquote:text-zinc-400
          prose-hr:border-blue-900 prose-table:text-sm
          prose-th:bg-blue-900 prose-th:text-zinc-200 prose-td:text-zinc-300
          prose-a:text-[#2ee6a6] prose-a:no-underline hover:prose-a:underline">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {msg.content}
          </ReactMarkdown>
        </div>
      </div>
      <div className="flex gap-0.5">
        <CopyButton text={msg.content} />
        <BranchButton onClick={() => onBranch(index)} />
      </div>
    </div>
  );
});


function ThinkingIndicator() {
  const [seconds, setSeconds] = useState(0);
  const [dot, setDot] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    const dots  = setInterval(() => setDot((d) => (d + 1) % 4), 400);
    return () => { clearInterval(timer); clearInterval(dots); };
  }, []);

  const dotStr = ".".repeat(dot);
  const elapsed = seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

  return (
    <div className="flex justify-start">
      <div className="bg-blue-950 border border-blue-900 rounded-2xl rounded-tl-sm px-5 py-3 flex items-center gap-3">
        {/* Animated pulse ring */}
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2ee6a6] opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2ee6a6]" />
        </span>
        <span className="text-sm text-zinc-400">
          Thinking<span className="inline-block w-4 text-left">{dotStr}</span>
        </span>
        <span className="text-xs text-zinc-600 tabular-nums">{elapsed}</span>
      </div>
    </div>
  );
}

const MessageList = memo(function MessageList({
  messages,
  sending,
  bottomRef,
  searchTargetIdx,
  onBranch,
}: {
  messages: ChatMessage[];
  sending: boolean;
  bottomRef: React.RefObject<HTMLDivElement>;
  searchTargetIdx?: number;
  onBranch: (idx: number) => void;
}) {
  const targetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchTargetIdx === undefined || searchTargetIdx < 0) return;
    const t = setTimeout(() => {
      targetRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
      {messages.map((msg, i) => (
        <div key={i} ref={i === searchTargetIdx ? targetRef : undefined}>
          <MessageBubble msg={msg} isTarget={i === searchTargetIdx} index={i} onBranch={onBranch} />
        </div>
      ))}
      {sending && <ThinkingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
});

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative group">
      <button
        onClick={copy}
        title={copied ? "Copied!" : "Copy code"}
        className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-800 hover:bg-[#2ee6a6] hover:text-zinc-900 text-zinc-300 rounded p-1.5"
      >
        {copied ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
      <SyntaxHighlighter
        style={codeStyle as Record<string, React.CSSProperties>}
        language={language}
        PreTag="div"
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

const TEXT_EXTENSIONS = ".txt,.md,.js,.ts,.jsx,.tsx,.py,.go,.rs,.java,.c,.cpp,.h,.json,.yaml,.yml,.toml,.sh,.sql,.css,.html,.xml,.csv";

interface Props {
  conversation: Prompt;
  blocks: ContextBlock[];
  projectName: string;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onUpdate: (conv: Prompt) => void;
  onBranch: (conv: Prompt) => void;
  targetMsgIdx?: number;
}

function getDisplayMessages(conv: Prompt): ChatMessage[] {
  const msgs = (conv as any).messages as unknown as ChatMessage[];
  if (msgs && msgs.length > 0) return msgs;
  const result: ChatMessage[] = [];
  if (conv.userPrompt) result.push({ role: "user", content: conv.userPrompt });
  if (conv.responseText) result.push({ role: "assistant", content: conv.responseText });
  return result;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Anthropic hard limit: 5 MB base64. Target 4.5 MB to leave headroom.
const MAX_IMAGE_B64 = 4.5 * 1024 * 1024;

function compressImage(file: File): Promise<{ data: string; mediaType: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;

      // Scale down large images — start at max 2048px on the long edge
      const MAX_DIM = 2048;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const draw = (w: number, h: number, q: number) => {
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL("image/jpeg", q);
      };

      // Try progressively lower quality first
      let dataUrl = draw(width, height, 0.85);
      const qualities = [0.75, 0.60, 0.45];
      for (const q of qualities) {
        if (dataUrl.length <= MAX_IMAGE_B64) break;
        dataUrl = draw(width, height, q);
      }

      // If still over limit, halve dimensions until it fits
      while (dataUrl.length > MAX_IMAGE_B64 && width > 256) {
        width = Math.round(width * 0.6);
        height = Math.round(height * 0.6);
        dataUrl = draw(width, height, 0.75);
      }

      const base64 = dataUrl.split(",")[1];
      resolve({ data: base64, mediaType: "image/jpeg", preview: dataUrl });
    };
    img.src = url;
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const DOC_TYPES = [
  { id: "notes",      label: "Technical Notes",             icon: "📝" },
  { id: "adr",        label: "Architecture Decision Record", icon: "🏛"  },
  { id: "onboarding", label: "Onboarding Guide",            icon: "🗺"  },
  { id: "runbook",    label: "Runbook",                     icon: "📋" },
] as const;

// Lightweight markdown → HTML converter for print/download output.
// Handles the patterns our doc generator produces: headings, bold, italic,
// inline code, fenced code blocks, bullet lists, and horizontal rules.
function mdToHtml(md: string): string {
  const codeBlocks: string[] = [];

  // Stash fenced code blocks so inner content isn't processed
  let html = md.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) => {
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    codeBlocks.push(`<pre><code>${escaped}</code></pre>`);
    return `\x00BLOCK${codeBlocks.length - 1}\x00`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, (_, c) =>
    `<code>${c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`
  );

  // Bold + italic, then bold, then italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");

  const lines = html.split("\n");
  const out: string[] = [];
  let inList = false;

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("### "))      { if (inList) { out.push("</ul>"); inList = false; } out.push(`<h3>${t.slice(4)}</h3>`); }
    else if (t.startsWith("## ")) { if (inList) { out.push("</ul>"); inList = false; } out.push(`<h2>${t.slice(3)}</h2>`); }
    else if (t.startsWith("# "))  { if (inList) { out.push("</ul>"); inList = false; } out.push(`<h1>${t.slice(2)}</h1>`); }
    else if (t.startsWith("- ") || t.startsWith("* ")) { if (!inList) { out.push("<ul>"); inList = true; } out.push(`<li>${t.slice(2)}</li>`); }
    else if (t === "---")          { if (inList) { out.push("</ul>"); inList = false; } out.push("<hr>"); }
    else if (t === "")             { if (inList) { out.push("</ul>"); inList = false; } }
    else if (t.startsWith("\x00BLOCK")) {
      if (inList) { out.push("</ul>"); inList = false; }
      const idx = parseInt(t.replace(/\x00BLOCK(\d+)\x00/, "$1"));
      out.push(codeBlocks[idx] ?? "");
    }
    else { if (inList) { out.push("</ul>"); inList = false; } out.push(`<p>${line}</p>`); }
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

const PRINT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Georgia,'Times New Roman',serif;font-size:12pt;line-height:1.75;color:#1a1a1a;max-width:760px;margin:0 auto;padding:52px 64px;background:#fff}
  h1{font-size:22pt;font-weight:700;padding-bottom:10px;border-bottom:2.5px solid #1a1a1a;margin-bottom:6px;letter-spacing:-.3px}
  h2{font-size:11pt;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#444;margin-top:30px;margin-bottom:8px}
  h3{font-size:12pt;font-weight:700;margin-top:20px;margin-bottom:4px}
  p{margin-bottom:12px}
  ul{margin:6px 0 14px 22px}
  li{margin-bottom:5px}
  code{font-family:'Courier New',monospace;font-size:9.5pt;background:#f4f4f4;border:1px solid #ddd;padding:1px 5px;border-radius:3px}
  pre{background:#f7f7f7;border:1px solid #e0e0e0;border-radius:4px;padding:14px 18px;overflow:auto;margin:12px 0 16px}
  pre code{background:none;border:none;padding:0;font-size:9.5pt;line-height:1.5}
  strong{font-weight:700}em{font-style:italic}
  hr{border:none;border-top:1px solid #ccc;margin:24px 0}
  .meta{font-family:Arial,sans-serif;font-size:9.5pt;color:#888;margin-top:4px}
  @media print{body{padding:0;max-width:100%}@page{margin:1in}}
`;

async function downloadAsPdf(content: string, label: string, filename: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const ML = 72; // 1-inch margins
  const colW = pageW - ML * 2;
  let y = ML;

  const date = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  // Meta line
  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150);
  doc.text(`${label}  ·  ${date}`, ML, y);
  y += 22;

  const addWrapped = (text: string, size: number, bold: boolean, r: number, g: number, b: number, indent = 0, leading = 1.45) => {
    doc.setFontSize(size); doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setTextColor(r, g, b);
    const lines = doc.splitTextToSize(text, colW - indent);
    const lh = size * leading;
    if (y + lines.length * lh > pageH - ML) { doc.addPage(); y = ML; }
    doc.text(lines, ML + indent, y);
    y += lines.length * lh;
  };

  let inCode = false;
  for (const line of content.split("\n")) {
    if (line.startsWith("```")) { inCode = !inCode; if (!inCode) y += 6; continue; }

    if (inCode) {
      const lh = 11;
      doc.setFontSize(8.5); doc.setFont("courier", "normal"); doc.setTextColor(60, 60, 60);
      const ls = doc.splitTextToSize(line || " ", colW - 20);
      if (y + ls.length * lh > pageH - ML) { doc.addPage(); y = ML; }
      doc.text(ls, ML + 10, y); y += ls.length * lh;
      continue;
    }

    const t = line.trim();
    const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1").replace(/\*(.+?)\*/g, "$1");

    if (t.startsWith("# ")) {
      y += 10;
      addWrapped(plain(t.slice(2)), 20, true, 10, 10, 10);
      doc.setDrawColor(20, 20, 20); doc.setLineWidth(1.5);
      doc.line(ML, y + 2, pageW - ML, y + 2); y += 14;
    } else if (t.startsWith("## ")) {
      y += 16;
      doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(120, 120, 120);
      doc.text(plain(t.slice(3)).toUpperCase(), ML, y); y += 14;
    } else if (t.startsWith("### ")) {
      y += 8; addWrapped(plain(t.slice(4)), 11, true, 30, 30, 30); y += 2;
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 50);
      doc.text("•", ML, y);
      addWrapped(plain(t.slice(2)), 10, false, 50, 50, 50, 14, 1.5);
    } else if (t === "---") {
      y += 8; doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.5);
      doc.line(ML, y, pageW - ML, y); y += 14;
    } else if (t === "") {
      y += 9;
    } else {
      addWrapped(plain(t), 10.5, false, 50, 50, 50, 0, 1.55); y += 4;
    }
  }

  doc.save(filename);
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildDocxHtml(content: string, label: string): string {
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${label}</title><style>${PRINT_CSS}</style></head><body><p class="meta">${label} &nbsp;·&nbsp; ${date}</p>${mdToHtml(content)}</body></html>`;
}

function GenerateDocModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [docType, setDocType] = useState<string>("notes");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ content: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/prompts/${conversationId}/generate-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setGenerating(false);
    }
  }

  const slug = result?.label.toLowerCase().replace(/\s+/g, "-") ?? "document";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-[#060e1e] border border-blue-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-900/60 shrink-0">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ee6a6" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            <span className="text-sm font-semibold text-zinc-200">
              {result ? result.label : "Generate Documentation"}
            </span>
            {result && (
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest">
                {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors p-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!result ? (
            <div className="p-6 space-y-5">
              <p className="text-sm text-zinc-500">Choose a format — Orbit will generate it from this conversation using Claude.</p>
              <div className="grid grid-cols-2 gap-3">
                {DOC_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDocType(t.id)}
                    className={`flex items-start gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                      docType === t.id
                        ? "bg-[#2ee6a6]/10 border-[#2ee6a6]/40 text-[#2ee6a6]"
                        : "border-blue-900 text-zinc-400 hover:border-blue-700 hover:text-zinc-200 hover:bg-blue-950/40"
                    }`}
                  >
                    <span className="text-xl mt-0.5">{t.icon}</span>
                    <span className="text-sm font-medium leading-snug">{t.label}</span>
                  </button>
                ))}
              </div>
              {error && <p className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>}
            </div>
          ) : (
            /* Document preview — white "paper" card */
            <div className="p-6">
              <div className="bg-white rounded-xl shadow-sm border border-zinc-200 px-10 py-8 min-h-64">
                <div className="prose prose-zinc max-w-none
                  prose-headings:font-bold prose-headings:text-zinc-900
                  prose-h1:text-2xl prose-h1:pb-3 prose-h1:border-b-2 prose-h1:border-zinc-900 prose-h1:mb-2
                  prose-h2:text-[11px] prose-h2:uppercase prose-h2:tracking-widest prose-h2:text-zinc-500 prose-h2:mt-8 prose-h2:mb-2
                  prose-h3:text-sm prose-h3:text-zinc-800
                  prose-p:text-zinc-700 prose-p:leading-relaxed prose-p:text-sm
                  prose-li:text-zinc-700 prose-li:text-sm
                  prose-code:text-[#c2410c] prose-code:bg-orange-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
                  prose-pre:bg-zinc-50 prose-pre:border prose-pre:border-zinc-200 prose-pre:text-xs
                  prose-strong:text-zinc-900
                  prose-hr:border-zinc-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {result.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-blue-900/60 shrink-0 flex items-center justify-between gap-3">
          {result ? (
            <>
              <button
                onClick={() => { setResult(null); setError(null); }}
                className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                Back
              </button>
              <div className="flex items-center gap-2">
                {/* Copy */}
                <button
                  onClick={() => { navigator.clipboard.writeText(result.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-800 text-zinc-400 hover:text-zinc-200 hover:border-blue-600 transition-colors text-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  {copied ? "Copied!" : "Copy Text"}
                </button>
                {/* Download Markdown */}
                <button
                  onClick={() => downloadFile(result.content, `${slug}.md`, "text/markdown")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-800 text-zinc-400 hover:text-zinc-200 hover:border-blue-600 transition-colors text-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Markdown
                </button>
                {/* Download Word */}
                <button
                  onClick={() => downloadFile(buildDocxHtml(result.content, result.label), `${slug}.doc`, "application/msword")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-800 text-zinc-400 hover:text-zinc-200 hover:border-blue-600 transition-colors text-xs"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Word Doc
                </button>
                {/* Download PDF */}
                <button
                  onClick={() => downloadAsPdf(result.content, result.label, `${slug}.pdf`)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2ee6a6] text-zinc-900 hover:bg-[#26c98f] transition-colors text-xs font-semibold"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download PDF
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={onClose} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">Cancel</button>
              <button
                onClick={generate}
                disabled={generating}
                className="flex items-center gap-2 bg-[#2ee6a6] text-zinc-900 rounded-lg px-5 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-[#26c98f] transition-colors"
              >
                {generating && <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-900/20 border-t-zinc-900 animate-spin" />}
                {generating ? "Generating…" : "Generate"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatView({ conversation, blocks, projectName, sidebarOpen, onToggleSidebar, onUpdate, onBranch, targetMsgIdx }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => getDisplayMessages(conversation));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [activeBlockIds, setActiveBlockIds] = useState<Set<string>>(
    () => new Set((conversation.includedBlockIds as string[]) ?? blocks.map((b) => b.id))
  );
  const [currentModel, setCurrentModel] = useState(conversation.modelName);
  const [hasIndexedFiles, setHasIndexedFiles] = useState(false);
  const [retrievedFiles, setRetrievedFiles] = useState<{ id: string; path: string }[]>([]);
  const [searchingFiles, setSearchingFiles] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Stable index of the message to scroll to — provided directly by the search result
  const [searchTargetIdx] = useState(() => targetMsgIdx ?? -1);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isFirstRender = useRef(true);

  // Check if project has indexed files on mount
  useEffect(() => {
    const pid = (conversation as any).projectId as string;
    if (!pid) return;
    fetch(`/api/projects/${pid}/files`)
      .then((r) => r.json())
      .then((d) => setHasIndexedFiles((d.count ?? 0) > 0))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced file search while user types
  useEffect(() => {
    if (!hasIndexedFiles || input.trim().length < 3) {
      setRetrievedFiles([]);
      return;
    }
    clearTimeout(searchTimeoutRef.current);
    setSearchingFiles(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const pid = (conversation as any).projectId as string;
        const r = await fetch(`/api/projects/${pid}/files/search?q=${encodeURIComponent(input.trim())}`);
        const d = await r.json();
        setRetrievedFiles(d.files ?? []);
      } catch {}
      setSearchingFiles(false);
    }, 700);
    return () => clearTimeout(searchTimeoutRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, hasIndexedFiles]);

  // Auto-resize textarea as the user types
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, 220);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > 220 ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    // On the very first render, let MessageList scroll to the search target instead
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (searchTargetIdx >= 0) return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleBranch = useCallback(async (messageIdx: number) => {
    const res = await fetch(`/api/prompts/${conversation.id}/branch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIdx }),
    });
    const json = await res.json();
    if (res.ok) onBranch(json.prompt);
  }, [conversation.id, onBranch]);

  function toggleBlock(id: string) {
    setActiveBlockIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleFiles(fileList: FileList) {
    const MAX_SIZE = 10 * 1024 * 1024;
    const files = Array.from(fileList).filter((f) => f.size <= MAX_SIZE);
    if (files.length === 0) return;

    const isFolder = files.some((f) => (f as any).webkitRelativePath);

    if (isFolder) {
      // Merge all folder files into one combined text attachment
      const folderName = ((files[0] as any).webkitRelativePath as string).split("/")[0];
      const parts: string[] = [];
      const imageAttachments: PendingAttachment[] = [];

      for (const file of files.slice(0, 50)) {
        const relPath = (file as any).webkitRelativePath || file.name;
        if (file.type.startsWith("image/")) {
          const { data, mediaType, preview } = await compressImage(file);
          imageAttachments.push({ name: relPath, mediaType, data, preview });
        } else if (file.type === "application/pdf") {
          const data = await readAsBase64(file);
          imageAttachments.push({ name: relPath, mediaType: file.type, data, preview: null });
        } else {
          try {
            const text = await readAsText(file);
            parts.push(`--- ${relPath} ---\n${text}`);
          } catch {}
        }
      }

      const newAttachments: PendingAttachment[] = [];
      if (parts.length > 0) {
        newAttachments.push({ name: `${folderName} folder`, mediaType: "text/plain", data: parts.join("\n\n"), preview: null });
      }
      // Images/PDFs from the folder are appended individually (Claude needs them as content blocks)
      newAttachments.push(...imageAttachments);

      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    } else {
      // Individual file attachments
      const newAttachments: PendingAttachment[] = [];
      for (const file of files.slice(0, 20)) {
        if (file.type.startsWith("image/")) {
          const { data, mediaType, preview } = await compressImage(file);
          newAttachments.push({ name: file.name, mediaType, data, preview });
        } else if (file.type === "application/pdf") {
          const data = await readAsBase64(file);
          newAttachments.push({ name: file.name, mediaType: file.type, data, preview: null });
        } else {
          const data = await readAsText(file);
          newAttachments.push({ name: file.name, mediaType: "text/plain", data, preview: null });
        }
      }
      setPendingAttachments((prev) => [...prev, ...newAttachments]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
  }

  async function send() {
    if ((!input.trim() && pendingAttachments.length === 0) || sending) return;
    const userMessage = input.trim();
    const attachments: FileAttachment[] = pendingAttachments.map(({ preview: _, ...a }) => a);

    setInput("");
    setPendingAttachments([]);
    setRetrievedFiles([]);
    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: userMessage, attachments: attachments.length > 0 ? attachments : undefined }]);

    try {
      const res = await fetch(`/api/prompts/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: userMessage || " ",
          includedBlockIds: Array.from(activeBlockIds),
          attachments,
          model: currentModel,
        }),
      });
      let json: any;
      try {
        json = await res.json();
      } catch {
        throw new Error("Server returned an invalid response. The context may be too large — try deselecting some context blocks.");
      }
      if (!res.ok) throw new Error(json.error || "failed");
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
      // Update token counts without replacing the full conversation object
      if (json.inputTokens != null) {
        onUpdate({ ...conversation, inputTokens: json.inputTokens, outputTokens: json.outputTokens });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Header — hidden in full-screen mode */}
      {showDocModal && (
        <GenerateDocModal conversationId={conversation.id} onClose={() => setShowDocModal(false)} />
      )}

      {sidebarOpen && <div className="border-b border-teal-900 shrink-0 flex items-center gap-3 px-4 h-14">
        <button
          onClick={onToggleSidebar}
          className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded shrink-0"
          title="Go full screen"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
            <path d="M3 16v3a2 2 0 0 0 2 2h3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200 truncate">
            {projectName} — {conversation.userPrompt}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">{conversation.modelName}</p>
        </div>
        {(conversation.inputTokens != null) && (
          <div className="shrink-0 text-right">
            <p className="text-[11px] text-zinc-500 leading-tight">
              {formatTokens(conversation.inputTokens ?? 0)} in
            </p>
            <p className="text-[11px] text-zinc-600 leading-tight">
              {formatTokens(conversation.outputTokens ?? 0)} out
            </p>
          </div>
        )}
        <button
          onClick={() => setShowDocModal(true)}
          title="Generate documentation from this conversation"
          className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-[#2ee6a6] hover:bg-[#2ee6a6]/10 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </button>
      </div>}

      {/* Floating exit button — only visible in full-screen mode */}
      <div
        className="absolute top-3 left-3 z-10 transition-opacity duration-300"
        style={{ opacity: sidebarOpen ? 0 : 1, pointerEvents: sidebarOpen ? "none" : "auto" }}
      >
        <button
          onClick={onToggleSidebar}
          title="Exit full screen"
          className="p-1.5 rounded-lg bg-blue-950/90 border border-blue-800 text-zinc-400 hover:text-zinc-100 hover:bg-blue-900 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
          </svg>
        </button>
      </div>

      <MessageList messages={messages} sending={sending} bottomRef={bottomRef} searchTargetIdx={searchTargetIdx >= 0 ? searchTargetIdx : undefined} onBranch={handleBranch} />

      {/* Input area */}
      <div className="shrink-0 px-6 pt-3 pb-4 border-t border-teal-900 space-y-2">
        {/* Context toggles */}
        {blocks.length > 0 && (
          <details>
            <summary className="text-xs text-zinc-400 cursor-pointer select-none hover:text-zinc-200 transition-colors w-fit">
              Context ({activeBlockIds.size}/{blocks.length} active)
            </summary>
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() =>
                    setActiveBlockIds(
                      activeBlockIds.size === blocks.length
                        ? new Set()
                        : new Set(blocks.map((b) => b.id))
                    )
                  }
                  className="text-xs rounded-full px-2.5 py-1 border transition-colors border-zinc-600 text-zinc-400 hover:border-[#2ee6a6]/50 hover:text-[#2ee6a6]"
                >
                  {activeBlockIds.size === blocks.length ? "Deselect all" : "Select all"}
                </button>
                {blocks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => toggleBlock(b.id)}
                    className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                      activeBlockIds.has(b.id)
                        ? "bg-[#2ee6a6]/15 border-[#2ee6a6]/50 text-[#2ee6a6]"
                        : "bg-transparent border-blue-800 text-zinc-500 hover:border-blue-600 hover:text-zinc-400"
                    }`}
                  >
                    {b.title}
                  </button>
                ))}
              </div>
            </div>
          </details>
        )}

        {/* Model selector */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-zinc-600 shrink-0">Model:</span>
          <div className="flex gap-1">
            {AVAILABLE_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setCurrentModel(m.id)}
                title={m.description}
                className={`px-2.5 py-0.5 text-[10px] font-medium rounded-full border transition-colors ${
                  currentModel === m.id
                    ? "bg-[#2ee6a6]/15 border-[#2ee6a6]/50 text-[#2ee6a6]"
                    : "border-blue-800 text-zinc-500 hover:border-blue-600 hover:text-zinc-300"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pending attachments preview */}
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingAttachments.map((att, i) => (
              <div key={i} className="relative group">
                {att.preview ? (
                  <img src={att.preview} alt={att.name} className="h-14 w-14 object-cover rounded-lg border border-blue-700" />
                ) : (
                  <div className="h-9 px-2.5 flex items-center gap-1.5 bg-[#0f1d3a] border border-blue-700 rounded-lg text-xs text-zinc-300 max-w-[160px]">
                    <span>{att.mediaType === "application/pdf" ? "📄" : "📝"}</span>
                    <span className="truncate">{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] items-center justify-center hidden group-hover:flex"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Retrieved files panel — read-only preview of what the server will retrieve */}
        {hasIndexedFiles && (searchingFiles || retrievedFiles.length > 0) && (
          <div className="border border-blue-800 rounded-lg p-2.5 space-y-1.5 bg-[#080f1f]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                {searchingFiles ? (
                  <><span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-zinc-600/30 border-t-zinc-500 animate-spin" />Searching files…</>
                ) : (
                  <><span className="text-[#2ee6a6]">⌖</span>{retrievedFiles.length} file{retrievedFiles.length !== 1 ? "s" : ""} queued for this query</>
                )}
              </span>
              {!searchingFiles && (
                <button onClick={() => setRetrievedFiles([])} className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors">clear</button>
              )}
            </div>
            {!searchingFiles && retrievedFiles.length > 0 && (
              <div className="space-y-0.5 max-h-28 overflow-y-auto pr-1">
                {retrievedFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-2 py-0.5">
                    <span className="text-[#2ee6a6]/50 shrink-0 text-[10px]">›</span>
                    <span className="text-[11px] font-mono text-zinc-400 truncate">{f.path}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && <ErrorToast error={error} onDismiss={() => setError(null)} />}

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" multiple accept={`image/*,application/pdf,${TEXT_EXTENSIONS}`} className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
        <input ref={folderInputRef} type="file" multiple className="hidden" {...{ webkitdirectory: "" }} onChange={(e) => e.target.files && handleFiles(e.target.files)} />

        <div className="flex gap-2 items-end">
          {/* Attach buttons */}
          <div className="flex flex-col gap-1.5 shrink-0 pb-1">
            <button onClick={() => fileInputRef.current?.click()} title="Attach files" className="text-zinc-400 hover:text-[#2ee6a6] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button onClick={() => folderInputRef.current?.click()} title="Attach folder" className="text-zinc-400 hover:text-[#2ee6a6] transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="flex-1 border border-blue-800 rounded-xl px-4 py-2.5 text-sm bg-[#0f1d3a] text-white placeholder:text-zinc-500 resize-none"
            placeholder="Reply… (Enter to send, Shift+Enter for newline)"
            style={{ minHeight: "64px" }}
            value={input}
            disabled={sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
          />
          {/* Send button + token count stacked */}
          <div className="flex flex-col items-center gap-1 shrink-0 self-end">
            {(input.trim().length > 0 || pendingAttachments.length > 0) && (() => {
              const msgTokens = estimateMessageTokens(input, pendingAttachments);
              // Rough total context: current message + history + system prompt + optional file context
              const historyTokens = messages.length * 900;
              const systemTokens = 2_500;
              const fileTokens = hasIndexedFiles ? 5_000 : 0;
              const totalInput = msgTokens + historyTokens + systemTokens + fileTokens;
              const estimatedOutput = 2_000;
              const modelInfo = AVAILABLE_MODELS.find((m) => m.id === currentModel) ?? AVAILABLE_MODELS[1];
              const cost = estimateCost(totalInput, estimatedOutput, modelInfo.inputPerMTok, modelInfo.outputPerMTok);
              const colorClass = tokenColorClass(msgTokens);
              const bgClass = msgTokens >= 50_000 ? "bg-red-500/15" : msgTokens >= 10_000 ? "bg-amber-500/15" : "bg-[#2ee6a6]/10";
              return (
                <div className="flex flex-col items-center gap-0.5">
                  <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-md font-medium ${colorClass} ${bgClass}`}>
                    ~{formatTokens(msgTokens)} tok
                  </span>
                  <span className="text-[9px] tabular-nums text-zinc-600" title={`~${formatTokens(totalInput)} total context tokens`}>
                    est. {formatCost(cost)}
                  </span>
                </div>
              );
            })()}
            <button
              onClick={send}
              disabled={sending || (!input.trim() && pendingAttachments.length === 0)}
              className="bg-[#2ee6a6] text-zinc-900 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-[#26c98f] transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
