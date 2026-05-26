"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ContextBlock } from "@prisma/client";
import { ErrorToast } from "@/components/ErrorToast";

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
  const [generatingContext, setGeneratingContext] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [suggestedBlocks, setSuggestedBlocks] = useState<{ title: string; content: string; tags: string[] }[] | null>(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());
  const [expandedSuggestion, setExpandedSuggestion] = useState<number | null>(null);
  const [analyzingBlockId, setAnalyzingBlockId] = useState<string | null>(null);

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
    const allFiles = Array.from(fileList);
    if (allFiles.length === 0) return;

    const isFolder = allFiles.some((f) => (f as any).webkitRelativePath);

    // --- Folder upload: merge text + images into one JSON block ---
    if (isFolder) {
      const folderName = ((allFiles[0] as any).webkitRelativePath as string).split("/")[0];
      const blockTitle = `${folderName} folder`;

      // Directories to skip entirely — these cause OOM on large codebases
      const IGNORED_DIRS = new Set([
        "node_modules", ".git", ".next", "dist", "build", "out", "target",
        "__pycache__", ".cache", "vendor", "bin", "obj", "coverage",
        ".vscode", ".idea", "venv", ".env", "eggs", "__snapshots__",
        ".parcel-cache", ".turbo", ".svelte-kit", "storybook-static",
      ]);

      const MAX_FILE_CHARS = 500_000;   // 500KB per file
      const MAX_TOTAL_CHARS = 8_000_000; // 8MB total text
      const MAX_IMAGES = 10;

      const shouldSkip = (relPath: string) =>
        relPath.split("/").some((seg) => IGNORED_DIRS.has(seg));

      // Score files so entry points and key source files are processed first,
      // preventing them from being cut off by the total-chars limit
      function filePriority(relPath: string): number {
        const name = (relPath.split("/").pop() || "").toLowerCase();
        if (/^(main|app|program|startup|index|entrypoint)/i.test(name)) return 0;
        if (name.endsWith(".cs") || name.endsWith(".xaml.cs")) return 1;
        if (name.endsWith(".xaml")) return 2;
        if (/\.(ts|tsx|js|jsx|py|go|rs|java)$/.test(name)) return 3;
        if (/\.(json|yaml|yml|toml|ini|config)$/.test(name)) return 4;
        return 5;
      }

      const sortedFiles = [...allFiles].sort((a, b) => {
        const pa = filePriority((a as any).webkitRelativePath || a.name);
        const pb = filePriority((b as any).webkitRelativePath || b.name);
        if (pa !== pb) return pa - pb;
        // Within same priority: sort by basename alphabetically so subdirectory
        // files are interleaved with root files instead of all appearing at the end.
        const na = ((a as any).webkitRelativePath || a.name).split("/").pop()?.toLowerCase() ?? "";
        const nb = ((b as any).webkitRelativePath || b.name).split("/").pop()?.toLowerCase() ?? "";
        return na.localeCompare(nb);
      });

      const parts: string[] = [];
      const images: { name: string; mediaType: string; data: string }[] = [];
      let totalChars = 0;
      let skipped = 0;
      let processed = 0;

      for (const file of sortedFiles) {
        const relPath = (file as any).webkitRelativePath || file.name;

        if (shouldSkip(relPath)) { skipped++; continue; }

        if (file.type.startsWith("image/")) {
          // Only store types Anthropic accepts; normalise image/jpg → image/jpeg
          const mt = file.type === "image/jpg" ? "image/jpeg" : file.type;
          const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mt);
          if (!supported || images.length >= MAX_IMAGES || file.size > 1024 * 1024) { skipped++; continue; }
          try {
            const dataUrl = await readAsDataUrl(file);
            images.push({ name: relPath, mediaType: mt, data: dataUrl.split(",")[1] });
          } catch {}
          continue;
        }

        if (file.type === "application/pdf") { skipped++; continue; }

        // Text file — enforce per-file and total size limits
        if (file.size > MAX_FILE_CHARS || totalChars >= MAX_TOTAL_CHARS) { skipped++; continue; }

        try {
          let text = await readAsText(file);
          if (text.length > MAX_FILE_CHARS) text = text.slice(0, MAX_FILE_CHARS) + "\n[truncated]";
          parts.push(`--- ${relPath} ---\n${text}`);
          totalChars += text.length;
          processed++;
        } catch {}

        if (processed % 50 === 0) {
          setUploadProgress(`Processing "${folderName}"… ${processed} files`);
          // Yield to browser to prevent UI freeze
          await new Promise(r => setTimeout(r, 0));
        }
      }

      const folderJson = JSON.stringify({
        _folder: true,
        description: "",
        textContent: parts.join("\n\n"),
        images,
        stats: { processed, skipped },
      });

      setUploadProgress(null);
      setFolderDescription("");
      setPendingFolder({ title: blockTitle, content: folderJson });
      if (folderInputRef.current) folderInputRef.current.value = "";
      return;
    }

    // Individual files — apply a reasonable size filter
    const files = allFiles.filter((f) => f.size <= 5 * 1024 * 1024);

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
    let finalContent = pendingFolder.content;
    const desc = folderDescription.trim();
    if (desc) {
      try {
        const parsed = JSON.parse(finalContent);
        if (parsed._folder) {
          parsed.description = desc;
          finalContent = JSON.stringify(parsed);
        } else {
          finalContent = `Description: ${desc}\n\n${finalContent}`;
        }
      } catch {
        finalContent = `Description: ${desc}\n\n${finalContent}`;
      }
    }
    try {
      await fetch(`/api/projects/${projectId}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pendingFolder.title, content: finalContent, tags: ["folder"] }),
      });
      setPendingFolder(null);
      setFolderDescription("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function getTextContentFromFolder(raw: string): string {
    try {
      const p = JSON.parse(raw);
      if (p._folder) return p.textContent || "";
    } catch {}
    return raw;
  }

  async function generateContext(textContent: string) {
    if (!textContent.trim()) {
      setGenerateError("No text files found in the folder to analyze.");
      return;
    }
    setGeneratingContext(true);
    setGenerateError(null);
    setSuggestedBlocks(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ textContent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate");
      setSuggestedBlocks(json.blocks);
      setSelectedSuggestions(new Set(json.blocks.map((_: unknown, i: number) => i)));
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Failed to generate context");
    } finally {
      setGeneratingContext(false);
    }
  }

  async function generateFromExistingBlock(block: ContextBlock) {
    setAnalyzingBlockId(block.id);
    setGenerateError(null);
    setSuggestedBlocks(null);
    setSelectedSuggestions(new Set());
    const text = getTextContentFromFolder(block.content);
    await generateContext(text);
    setAnalyzingBlockId(null);
  }

  async function saveSuggestedBlocks(alsoSaveFolder: boolean) {
    if (!suggestedBlocks) return;
    setSubmitting(true);
    try {
      const toSave = suggestedBlocks.filter((_, i) => selectedSuggestions.has(i));
      for (const b of toSave) {
        await fetch(`/api/projects/${projectId}/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b),
        });
      }
      if (alsoSaveFolder && pendingFolder) {
        // save the folder block too
        let finalContent = pendingFolder.content;
        const desc = folderDescription.trim();
        if (desc) {
          try {
            const parsed = JSON.parse(finalContent);
            if (parsed._folder) { parsed.description = desc; finalContent = JSON.stringify(parsed); }
            else finalContent = `Description: ${desc}\n\n${finalContent}`;
          } catch { finalContent = `Description: ${desc}\n\n${finalContent}`; }
        }
        await fetch(`/api/projects/${projectId}/context`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: pendingFolder.title, content: finalContent, tags: ["folder"] }),
        });
        setPendingFolder(null);
        setFolderDescription("");
      }
      setSuggestedBlocks(null);
      setSelectedSuggestions(new Set());
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  const isDataUrl = (s: string) => s.startsWith("data:");
  const isImageUrl = (s: string) => s.startsWith("data:image/");
  function parseFolderBlock(content: string) {
    try { const p = JSON.parse(content); return p._folder ? p : null; } catch { return null; }
  }

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
        <div className="border border-[#2ee6a6]/30 rounded-md bg-blue-950 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-[#2ee6a6]">📁 {pendingFolder.title}</p>
            <button onClick={() => { setPendingFolder(null); setSuggestedBlocks(null); setGenerateError(null); }} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Cancel</button>
          </div>

          <input
            className="w-full border border-blue-800 rounded px-2 py-1.5 text-sm bg-[#0f1d3a] text-zinc-100 placeholder:text-zinc-500"
            placeholder="Add a short description (optional)…"
            value={folderDescription}
            autoFocus
            onChange={(e) => setFolderDescription(e.target.value)}
          />

          {/* Generate context button */}
          {!suggestedBlocks && (
            <button
              onClick={() => generateContext(getTextContentFromFolder(pendingFolder.content))}
              disabled={generatingContext}
              className="w-full flex items-center justify-center gap-2 border border-[#2ee6a6]/40 text-[#2ee6a6] rounded px-3 py-1.5 text-sm hover:bg-[#2ee6a6]/10 disabled:opacity-50 transition-colors"
            >
              {generatingContext ? (
                <>
                  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Analyzing codebase…
                </>
              ) : (
                <>✨ Auto-generate context blocks</>
              )}
            </button>
          )}

          {generateError && <ErrorToast error={generateError} onDismiss={() => setGenerateError(null)} durationMs={30_000} />}

          {/* Suggested blocks preview */}
          {suggestedBlocks && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-300">{suggestedBlocks.length} context blocks generated</p>
                <button onClick={() => { setSuggestedBlocks(null); setSelectedSuggestions(new Set()); }} className="text-xs text-zinc-500 hover:text-zinc-300">Regenerate</button>
              </div>
              <div className="space-y-1.5">
                {suggestedBlocks.map((b, i) => (
                  <div key={i} className={`rounded-lg border transition-colors ${selectedSuggestions.has(i) ? "border-[#2ee6a6]/40 bg-[#2ee6a6]/5" : "border-blue-800 bg-[#0f1d3a]/50"}`}>
                    <div className="flex items-start gap-2 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedSuggestions.has(i)}
                        onChange={() => setSelectedSuggestions(prev => {
                          const next = new Set(prev);
                          next.has(i) ? next.delete(i) : next.add(i);
                          return next;
                        })}
                        className="accent-[#2ee6a6] mt-0.5 shrink-0"
                      />
                      <button
                        className="flex-1 min-w-0 text-left"
                        onClick={() => setExpandedSuggestion(expandedSuggestion === i ? null : i)}
                      >
                        <p className="text-sm font-medium text-zinc-200">{b.title}</p>
                        {b.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {b.tags.map(t => <span key={t} className="text-[10px] text-[#2ee6a6] bg-[#2ee6a6]/10 rounded px-1.5 py-0.5">{t}</span>)}
                          </div>
                        )}
                      </button>
                      <span className="text-zinc-600 text-xs mt-0.5 shrink-0">{expandedSuggestion === i ? "▲" : "▼"}</span>
                    </div>
                    {expandedSuggestion === i && (
                      <div className="px-3 pb-2 border-t border-blue-800/50">
                        <pre className="text-xs text-zinc-400 whitespace-pre-wrap mt-2 line-clamp-6">{b.content}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => saveSuggestedBlocks(true)}
                  disabled={submitting || selectedSuggestions.size === 0}
                  className="flex-1 bg-[#2ee6a6] text-zinc-900 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-[#26c98f] transition-colors"
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-900/20 border-t-zinc-900 animate-spin" />
                      Saving…
                    </span>
                  ) : `Save folder + ${selectedSuggestions.size} block${selectedSuggestions.size !== 1 ? "s" : ""}`}
                </button>
                <button
                  onClick={saveFolderBlock}
                  disabled={submitting}
                  className="text-sm text-zinc-400 hover:text-zinc-200 px-3 py-1.5 border border-blue-800 rounded transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {!suggestedBlocks && (
            <button
              onClick={saveFolderBlock}
              disabled={submitting}
              className="w-full bg-[#2ee6a6] text-zinc-900 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-[#26c98f] transition-colors"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-900/20 border-t-zinc-900 animate-spin" />
                  Saving…
                </span>
              ) : "Save to Context Vault"}
            </button>
          )}
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
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-900/20 border-t-zinc-900 animate-spin" />
                Saving…
              </span>
            ) : "Save block"}
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
              <div className="flex items-center gap-2 shrink-0">
                {parseFolderBlock(b.content) && (
                  <button
                    onClick={() => generateFromExistingBlock(b)}
                    disabled={analyzingBlockId === b.id}
                    title="Auto-generate context blocks from this folder"
                    className="text-xs text-zinc-500 hover:text-[#2ee6a6] transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {analyzingBlockId === b.id ? (
                      <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    ) : "✨"}
                  </button>
                )}
                <button onClick={() => remove(b.id)} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Delete</button>
              </div>
            </div>
            {b.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {b.tags.map((t) => (
                  <span key={t} className="text-[10px] uppercase tracking-wide text-blue-200 bg-blue-900 rounded px-1.5 py-0.5">{t}</span>
                ))}
              </div>
            )}
            {(() => {
              const folder = parseFolderBlock(b.content);
              if (folder) return (
                <div className="mt-2 space-y-1.5">
                  {folder.description && <p className="text-xs text-zinc-400 italic">{folder.description}</p>}
                  {folder.images.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {folder.images.slice(0, 6).map((img: any, i: number) => (
                        <img key={i} src={`data:${img.mediaType};base64,${img.data}`} alt={img.name} className="h-10 w-10 object-cover rounded border border-blue-800" />
                      ))}
                      {folder.images.length > 6 && <span className="text-xs text-zinc-500 self-center">+{folder.images.length - 6} more</span>}
                    </div>
                  )}
                  <p className="text-xs text-zinc-500">
                    {folder.images.length > 0 && `${folder.images.length} image(s)`}
                    {folder.images.length > 0 && folder.textContent && " · "}
                    {folder.textContent && `${folder.textContent.split("--- ").length - 1} text file(s)`}
                  </p>
                </div>
              );
              if (isImageUrl(b.content)) return <img src={b.content} alt={b.title} className="mt-2 rounded-lg max-h-32 object-contain w-full" />;
              if (isDataUrl(b.content)) return <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400"><span>📄</span><span>Binary file stored</span></div>;
              return <pre className="mt-2 text-xs text-zinc-300 whitespace-pre-wrap font-sans line-clamp-4">{b.content}</pre>;
            })()}
          </li>
        ))}
      </ul>

      {/* Suggestions panel for existing-block analysis */}
      {suggestedBlocks && !pendingFolder && (
        <div className="border border-[#2ee6a6]/30 rounded-md bg-blue-950 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-300">✨ {suggestedBlocks.length} generated blocks</p>
            <button onClick={() => { setSuggestedBlocks(null); setSelectedSuggestions(new Set()); setGenerateError(null); }} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">Dismiss</button>
          </div>
          {generateError && <ErrorToast error={generateError} onDismiss={() => setGenerateError(null)} durationMs={30_000} />}
          <div className="space-y-1.5">
            {suggestedBlocks.map((b, i) => (
              <div key={i} className={`rounded-lg border transition-colors ${selectedSuggestions.has(i) ? "border-[#2ee6a6]/40 bg-[#2ee6a6]/5" : "border-blue-800 bg-[#0f1d3a]/50"}`}>
                <div className="flex items-start gap-2 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={selectedSuggestions.has(i)}
                    onChange={() => setSelectedSuggestions(prev => {
                      const next = new Set(prev);
                      next.has(i) ? next.delete(i) : next.add(i);
                      return next;
                    })}
                    className="accent-[#2ee6a6] mt-0.5 shrink-0"
                  />
                  <button className="flex-1 min-w-0 text-left" onClick={() => setExpandedSuggestion(expandedSuggestion === i ? null : i)}>
                    <p className="text-sm font-medium text-zinc-200">{b.title}</p>
                    {b.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {b.tags.map(t => <span key={t} className="text-[10px] text-[#2ee6a6] bg-[#2ee6a6]/10 rounded px-1.5 py-0.5">{t}</span>)}
                      </div>
                    )}
                  </button>
                  <span className="text-zinc-600 text-xs mt-0.5 shrink-0">{expandedSuggestion === i ? "▲" : "▼"}</span>
                </div>
                {expandedSuggestion === i && (
                  <div className="px-3 pb-2 border-t border-blue-800/50">
                    <pre className="text-xs text-zinc-400 whitespace-pre-wrap mt-2 line-clamp-6">{b.content}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => saveSuggestedBlocks(false)}
            disabled={submitting || selectedSuggestions.size === 0}
            className="w-full bg-[#2ee6a6] text-zinc-900 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-[#26c98f] transition-colors"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full border-2 border-zinc-900/20 border-t-zinc-900 animate-spin" />
                Saving…
              </span>
            ) : `Add ${selectedSuggestions.size} block${selectedSuggestions.size !== 1 ? "s" : ""} to vault`}
          </button>
        </div>
      )}
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
