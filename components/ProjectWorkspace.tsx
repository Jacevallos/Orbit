"use client";

import { useState } from "react";
import type { Project, ContextBlock, Prompt } from "@prisma/client";
import { ConversationSidebar } from "./ConversationSidebar";
import { ChatView } from "./ChatView";

type ProjectWithRelations = Project & {
  contextBlocks: ContextBlock[];
  prompts: Prompt[];
};

export function ProjectWorkspace({ project }: { project: ProjectWithRelations }) {
  const [conversations, setConversations] = useState<Prompt[]>(project.prompts);
  const [selectedId, setSelectedId] = useState<string | null>(
    project.prompts[0]?.id ?? null
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  function addConversation(conv: Prompt) {
    setConversations((prev) => [conv, ...prev]);
    setSelectedId(conv.id);
  }

  function updateConversation(conv: Prompt) {
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? conv : c)));
  }

  return (
    <div className="-mx-6 -my-8 flex overflow-hidden" style={{ height: "calc(100vh - 57px)" }}>
      {/* Left sidebar */}
      {sidebarOpen && (
        <aside className="w-72 shrink-0 border-r border-teal-900 flex flex-col overflow-hidden">
          <ConversationSidebar
            projectId={project.id}
            conversations={conversations}
            selectedId={selectedId}
            blocks={project.contextBlocks}
            onSelect={setSelectedId}
            onNewConversation={addConversation}
          />
        </aside>
      )}

      {/* Main chat area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <ChatView
            key={selected.id}
            conversation={selected}
            blocks={project.contextBlocks}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((v) => !v)}
            onUpdate={updateConversation}
          />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toggle button even on empty state */}
            <div className="px-4 py-3 border-b border-teal-900 flex items-center">
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded"
                title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              >
                {sidebarOpen ? "◀" : "▶"}
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
