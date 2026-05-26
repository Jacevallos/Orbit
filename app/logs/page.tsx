"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type LogFile = "app" | "errors";

const LEVEL_COLOR: Record<string, string> = {
  "[INFO ]": "text-zinc-300",
  "[WARN ]": "text-amber-400",
  "[ERROR]": "text-red-400",
};

function colorLine(line: string): string {
  for (const key of Object.keys(LEVEL_COLOR)) {
    if (line.includes(key)) return LEVEL_COLOR[key];
  }
  return "text-zinc-500";
}

export default function LogsPage() {
  const [activeFile, setActiveFile] = useState<LogFile>("app");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = useCallback(async (file: LogFile) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/logs?file=${file}`);
      const json = await res.json();
      setContent(json.content ?? "");
      setLastUpdated(new Date());
    } catch {
      setContent("Failed to load logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(activeFile); }, [activeFile, fetchLogs]);

  async function clearLog() {
    if (!confirm(`Clear ${activeFile}.log?`)) return;
    setClearing(true);
    try {
      await fetch(`/api/logs?file=${activeFile}`, { method: "DELETE" });
      setContent("");
    } finally {
      setClearing(false);
    }
  }

  const lines = content.split("\n").filter(Boolean).reverse();

  return (
    <div className="min-h-full bg-[#050e1d] text-zinc-100 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Application Logs</h1>
            {lastUpdated && (
              <p className="text-xs text-zinc-500 mt-0.5">
                Last fetched {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearLog}
              disabled={clearing || lines.length === 0}
              className="text-xs text-zinc-500 hover:text-red-400 transition-colors px-3 py-1.5 border border-blue-900 rounded-lg disabled:opacity-40"
            >
              {clearing ? "Clearing…" : "Clear log"}
            </button>
            <button
              onClick={() => fetchLogs(activeFile)}
              disabled={loading}
              className="text-xs bg-blue-800 hover:bg-blue-700 text-zinc-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}>
                <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-blue-900">
          {(["app", "errors"] as LogFile[]).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFile(f)}
              className={`px-5 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeFile === f
                  ? "border-[#2ee6a6] text-[#2ee6a6]"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f === "app" ? "All Logs" : "Errors Only"}
            </button>
          ))}
        </div>

        {/* Log content */}
        {lines.length === 0 ? (
          <div className="text-center py-20 text-zinc-600 text-sm">
            {loading ? "Loading…" : "No log entries yet."}
          </div>
        ) : (
          <div className="bg-[#080f1f] border border-blue-900/60 rounded-xl overflow-auto max-h-[calc(100vh-220px)]">
            <table className="w-full text-xs font-mono">
              <tbody>
                {lines.map((line, i) => {
                  // Parse: [2026-05-26T...] [LEVEL] message {meta?}
                  const tsMatch = line.match(/^\[([^\]]+)\]/);
                  const lvlMatch = line.match(/\[([A-Z ]+)\]/g)?.[1];
                  const rest = line.replace(/^\[[^\]]+\]\s*\[[A-Z ]+\]\s*/, "");
                  return (
                    <tr
                      key={i}
                      className={`border-b border-blue-900/30 hover:bg-blue-900/20 transition-colors ${colorLine(line)}`}
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-zinc-600 w-[180px] shrink-0">
                        {tsMatch?.[1]?.replace("T", " ").replace(/\.\d+Z$/, "") ?? ""}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap w-16">
                        {lvlMatch?.replace(/\[|\]/g, "").trim() ?? ""}
                      </td>
                      <td className="px-3 py-1.5 break-all">{rest}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
