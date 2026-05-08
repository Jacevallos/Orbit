"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, goal }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "failed");
      const { project } = await res.json();
      router.push(`/projects/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setSubmitting(false);
    }
  }

  return (
    <section className="border border-zinc-200 rounded-md bg-white p-4 space-y-3">
      <h2 className="text-sm font-medium">New project</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="border border-zinc-300 rounded px-3 py-2 text-sm"
          placeholder="Name (e.g. BCBookScanner Debugging)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border border-zinc-300 rounded px-3 py-2 text-sm"
          placeholder="Goal (optional)"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={submitting || !name.trim()}
          className="bg-zinc-900 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
