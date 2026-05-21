"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Project {
  id: string;
  name: string;
  goal: string | null;
  _count: { contextBlocks: number; prompts: number };
}

export function ProjectList({ projects: initial }: { projects: Project[] }) {
  const [projects, setProjects] = useState(initial);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Re-fetch on every mount so navigating back always shows the latest projects,
  // regardless of Next.js router cache behavior.
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(({ projects }) => { if (Array.isArray(projects)) setProjects(projects); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function deleteProject(id: string) {
    setMenuOpenId(null);
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  if (projects.length === 0) {
    return <p className="text-sm text-zinc-400">No projects yet. Create one above.</p>;
  }

  return (
    <ul className="divide-y divide-blue-900 border border-blue-900 rounded-md bg-blue-950">
      {projects.map((p) => (
        <li key={p.id} className="group relative flex items-stretch">
          <Link
            href={`/projects/${p.id}`}
            onClick={() => setLoadingId(p.id)}
            className="flex-1 px-4 py-3 hover:bg-blue-900 transition-colors min-w-0"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium flex items-center gap-2">
                {p.name}
                {loadingId === p.id && (
                  <svg className="animate-spin text-[#2ee6a6] shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.22-8.56" strokeLinecap="round" />
                  </svg>
                )}
              </span>
              <span className="text-xs text-zinc-500 shrink-0">
                {p._count.contextBlocks} context block{p._count.contextBlocks !== 1 ? "s" : ""} · {p._count.prompts} chat{p._count.prompts !== 1 ? "s" : ""}
              </span>
            </div>
            {p.goal && (
              <p className="text-sm text-zinc-400 mt-1 line-clamp-1">{p.goal}</p>
            )}
          </Link>

          <div className="relative flex items-center pr-3 pl-1" ref={menuOpenId === p.id ? menuRef : undefined}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpenId === p.id ? null : p.id);
              }}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-blue-800 transition-all"
              title="More options"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>

            {menuOpenId === p.id && (
              <div className="absolute right-0 top-full mt-1 z-50 w-36 rounded-md border border-blue-800 bg-blue-950 shadow-xl py-1">
                <button
                  onClick={() => deleteProject(p.id)}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-blue-900 hover:text-red-300 transition-colors"
                >
                  Delete project
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
