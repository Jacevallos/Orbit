"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ContextBlock } from "@prisma/client";

interface Props {
  projectId: string;
  blocks: ContextBlock[];
}

const TEXT_EXTENSIONS = [".txt",".md",".js",".ts",".jsx",".tsx",".py",".go",".rs",".java",".c",".cpp",".h",".json",".yaml",".yml",".toml",".sh",".sql",".css",".html",".xml",".csv"];

export function ContextVault({ projectId, blocks }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [pendingFolder, setPendingFolder] = useState<{ title: string; content: string } | null>(null);
  const [folderDescription, setFolderDescription] = useState("");

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
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error("failed");
      setTitle(""); setContent(""); setTags(""); setAdding(false);
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

  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList).filter((f) => f.size <= 5 * 1024 * 1024);
    if (files.length === 0) return;

    const isFolder = files.some((f) => (f as any).webkitRelativePath);

    // --- Folder upload: merge everything into one block, then prompt for description ---
    if (isFolder) {
      const folderName = ((files[0] as any).webkitRelativePath as string).split("/")[0];
      const blockTitle = `${folderName} folder`;
      setUploadProgress(`Processing "${folderName}" folder…`);

      const parts: string[] = [];
      let skipped = 0;
      for (const file of files) {
        const relPath = (file as any).webkitRelativePath || file.name;
        if (file.type.startsWith("image/") || file.type === "application/pdf") {
          skipped++;
          continue;
        }
        try {
          const text = await readAsText(file);
          parts.push(`--- ${relPath} ---\n${text}`);
        } catch {}
      }

      const combined = parts.join("\n\n") + (skipped > 0 ? `\n\n[${skipped} binary file(s) not included]` : "");

      setUploadProgress(null);
      setFolderDescription("");
      setPendingFolder({ title: blockTitle, content: combined });
      if (folderInputRef.current) folderInputRef.current.value = "";
      return;
    }

    // --- Single file with form open: auto-fill ---
    if (files.length === 1 && adding) {
      const file = files[0];
      setTitle(file.name);
      if (file.type.startsWith("image/") || file.type === "application/pdf") {
        setContent(await readAsDataUrl(file));
      } else {
        setContent(await readAsText(file));
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // --- Multiple individual files: one block each ---
    setUploadProgress(`Uploading ${files.length} file(s)…`);
    let created = 0;
    for (const file of files) {
      try {
        const fileContent = file.type.startsWith("image/") || file.type === "application/pdf"
          ? await readAsDataUrl(file)
          : await readAsText(file);
        const res = await fetch(`/api/projects/${projectId}/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: file.name, content: fileContent, tags: [] }),
        });
        if (res.ok) created++;
        setUploadProgress(`Uploaded ${created}/${files.length}…`);
      } catch {}
    }
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
    router.refresh();
  }

  async function saveFolderBlock() {
    if (!pendingFolder) return;
    setSubmitting(true);
    const content = folderDescription.trim()
      ? `Description: ${folderDescription.trim()}\n\n${pendingFolder.content}`
      : pendingFolder.content;
    try {
      await fetch(`/api/projects/${projectId}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pendingFolder.title, content, tags: ["folder"] }),
      });
      setPendingFolder(null);
      setFolderDescription("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const isDataUrl = (s: string) => s.startsWith("data:");
  const isImageUrl = (s: string) => s.startsWith("data:image/");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">
          Context Vault ({blocks.length})
        </h2>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" multiple accept={`image/*,application/pdf,${TEXT_EXTENSIONS.join(",")}`} className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <input ref={folderInputRef} type="file" multiple className="hidden" {...{ webkitdirectory: "" }} onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <button onClick={() => fileInputRef.current?.click()} title="Upload files" className="text-zinc-400 hover:text-[#2ee6a6] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button onClick={() => folderInputRef.current?.click()} title="Upload folder" className="text-zinc-400 hover:text-[#2ee6a6] transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
          <button onClick={() => setAdding((v) => !v)} className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
            {adding ? "Cancel" : "+ Add"}
          </button>
        </div>
      </div>

      {uploadProgress && <p className="text-xs text-[#2ee6a6]">{uploadProgress}</p>}

      {/* Folder description prompt */}
      {pendingFolder && (
        <div className="border border-[#2ee6a6]/30 rounded-md bg-blue-950 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[#2ee6a6]">📁 {pendingFolder.title}</p>
            <button onClick={() => setPendingFolder(null)} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Cancel</button>
          </div>
          <input
            className="w-full border border-blue-800 rounded px-2 py-1.5 text-sm bg-[#0f1d3a] text-zinc-100 placeholder:text-zinc-500"
            placeholder="Add a short description (optional)…"
            value={folderDescription}
            autoFocus
            onChange={(e) => setFolderDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveFolderBlock(); }}
          />
          <button
            onClick={saveFolderBlock}
            disabled={submitting}
            className="w-full bg-[#2ee6a6] text-zinc-900 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-[#26c98f] transition-colors"
          >
            {submitting ? "Saving…" : "Save to Context Vault"}
          </button>
        </div>
      )}

      {adding && (
        <div className="border border-blue-900 rounded-md bg-blue-950 p-3 space-y-2">
          <input
            className="w-full border border-blue-800 rounded px-2 py-1.5 text-sm bg-[#0f1d3a] text-zinc-100 placeholder:text-teal-600"
            placeholder="Title (e.g. Tech stack, Bug description, My resume)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {isImageUrl(content) ? (
            <div className="relative">
              <img src={content} alt={title} className="w-full max-h-40 object-contain rounded-lg border border-blue-800" />
              <button onClick={() => setContent("")} className="absolute top-1 right-1 bg-red-500 text-white text-xs rounded px-1.5 py-0.5">Remove</button>
            </div>
          ) : isDataUrl(content) ? (
            <div className="flex items-center gap-2 bg-[#0f1d3a] border border-blue-800 rounded px-3 py-2 text-sm text-zinc-300">
              <span>📄</span><span className="truncate">{title || "file"}</span>
              <button onClick={() => setContent("")} className="ml-auto text-red-400 text-xs">Remove</button>
            </div>
          ) : (
            <textarea
              className="w-full border border-zinc-700 rounded px-2 py-1.5 text-sm font-mono bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
              placeholder="Content… or use 📎 above to attach a file"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          )}
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
          <li className="text-sm text-zinc-500">No context yet. Add text, code, or upload files above.</li>
        )}
        {blocks.map((b) => (
          <li key={b.id} className="border border-blue-900 rounded-md bg-blue-950 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm">{b.title}</div>
              <button onClick={() => remove(b.id)} className="text-xs text-zinc-500 hover:text-red-400 transition-colors shrink-0">Delete</button>
            </div>
            {b.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {b.tags.map((t) => (
                  <span key={t} className="text-[10px] uppercase tracking-wide text-blue-200 bg-blue-900 rounded px-1.5 py-0.5">{t}</span>
                ))}
              </div>
            )}
            {isImageUrl(b.content) ? (
              <img src={b.content} alt={b.title} className="mt-2 rounded-lg max-h-32 object-contain w-full" />
            ) : isDataUrl(b.content) ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                <span>📄</span><span>Binary file stored</span>
              </div>
            ) : (
              <pre className="mt-2 text-xs text-zinc-300 whitespace-pre-wrap font-sans line-clamp-4">{b.content}</pre>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
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
