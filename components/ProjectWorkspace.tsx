"use client";

import { useState, useEffect } from "react";
import type { Project, ContextBlock, Prompt } from "@prisma/client";
import { ConversationSidebar } from "./ConversationSidebar";
import { ChatView } from "./ChatView";

type ProjectWithRelations = Project & {
  contextBlocks: ContextBlock[];
  prompts: Prompt[];
};

interface WorkspaceProps {
  project: ProjectWithRelations;
  initialConvId?: string | null;
  targetMsgIdx?: number | null;
}

export function ProjectWorkspace({ project, initialConvId, targetMsgIdx }: WorkspaceProps) {
  const [conversations, setConversations] = useState<Prompt[]>(project.prompts);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConvId ?? project.prompts[0]?.id ?? null
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Suppress the outer page scrollbar — the workspace manages its own scrolling
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = ""; };
  }, []);

  // Hide the global header when sidebar is closed (full-screen mode)
  useEffect(() => {
    if (!sidebarOpen) {
      document.documentElement.setAttribute("data-fullscreen", "");
    } else {
      document.documentElement.removeAttribute("data-fullscreen");
    }
    return () => document.documentElement.removeAttribute("data-fullscreen");
  }, [sidebarOpen]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  function addConversation(conv: Prompt) {
    setConversations((prev) => [conv, ...prev]);
    setSelectedId(conv.id);
  }

  function updateConversation(conv: Prompt) {
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? conv : c)));
  }

  function deleteConversation(id: string) {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(conversations.find((c) => c.id !== id)?.id ?? null);
  }

  return (
    <div className="flex overflow-hidden h-full">
      {/* Left sidebar — always rendered, width animates to 0 when hidden */}
      <aside
        className="shrink-0 border-r border-teal-900 flex flex-col overflow-hidden"
        style={{
          width: sidebarOpen ? "288px" : "0px",
          transition: "width 300ms ease-in-out",
        }}
      >
          <ConversationSidebar
            projectId={project.id}
            conversations={conversations}
            selectedId={selectedId}
            blocks={project.contextBlocks}
            onSelect={setSelectedId}
            onNewConversation={addConversation}
            onDelete={deleteConversation}
          />
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <ChatView
            key={selected.id}
            conversation={selected}
            blocks={project.contextBlocks}
            projectName={project.name}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onUpdate={updateConversation}
            onBranch={addConversation}
            targetMsgIdx={targetMsgIdx ?? undefined}
          />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toggle button even on empty state */}
            <div className="px-4 py-3 border-b border-teal-900 flex items-center">
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded"
                title={sidebarOpen ? "Go full screen" : "Exit full screen"}
              >
                {sidebarOpen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
                    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                    <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
                  </svg>
                )}
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
              Start a new chat using the sidebar.
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
