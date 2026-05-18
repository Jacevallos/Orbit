"use client";

import { useState, useRef, useEffect, memo } from "react";
import type { Prompt, ContextBlock } from "@prisma/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
import type { ChatMessage, FileAttachment } from "@/lib/anthropic";

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

const MessageBubble = memo(function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-blue-900 border border-blue-800 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-zinc-100">
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
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] bg-blue-950 border border-blue-900 rounded-2xl rounded-tl-sm px-5 py-3">
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
    </div>
  );
});

const MessageList = memo(function MessageList({
  messages,
  sending,
  bottomRef,
}: {
  messages: ChatMessage[];
  sending: boolean;
  bottomRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
      {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
      {sending && (
        <div className="flex justify-start">
          <div className="bg-blue-950 border border-blue-900 rounded-2xl rounded-tl-sm px-5 py-3 text-zinc-400 text-sm italic">
            Thinking…
          </div>
        </div>
      )}
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
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onUpdate: (conv: Prompt) => void;
}

function getDisplayMessages(conv: Prompt): ChatMessage[] {
  const msgs = conv.messages as ChatMessage[];
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

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function ChatView({ conversation, blocks, sidebarOpen, onToggleSidebar, onUpdate }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => getDisplayMessages(conversation));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [activeBlockIds, setActiveBlockIds] = useState<Set<string>>(
    () => new Set((conversation.includedBlockIds as string[]) ?? blocks.map((b) => b.id))
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

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
          const data = await readAsBase64(file);
          imageAttachments.push({ name: relPath, mediaType: file.type, data, preview: `data:${file.type};base64,${data}` });
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
          const data = await readAsBase64(file);
          newAttachments.push({ name: file.name, mediaType: file.type, data, preview: `data:${file.type};base64,${data}` });
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
    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: userMessage, attachments: attachments.length > 0 ? attachments : undefined }]);

    try {
      const res = await fetch(`/api/prompts/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMessage || " ", includedBlockIds: Array.from(activeBlockIds), attachments }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
      onUpdate(json.conversation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-teal-900 shrink-0 flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded shrink-0"
          title={sidebarOpen ? "Hide history" : "Show history"}
        >
          {sidebarOpen ? "◀" : "▶"}
        </button>
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-200 truncate">{conversation.userPrompt}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{conversation.modelName}</p>
        </div>
      </div>

      <MessageList messages={messages} sending={sending} bottomRef={bottomRef} />

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

        {error && <p className="text-xs text-red-400">{error}</p>}

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
            className="flex-1 border border-blue-800 rounded-xl px-4 py-2.5 text-sm bg-[#0f1d3a] text-white placeholder:text-zinc-500 resize-none"
            placeholder="Reply… (Enter to send, Shift+Enter for newline)"
            rows={2}
            value={input}
            disabled={sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
          />
          <button
            onClick={send}
            disabled={sending || (!input.trim() && pendingAttachments.length === 0)}
            className="bg-[#2ee6a6] text-zinc-900 rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-[#26c98f] transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
