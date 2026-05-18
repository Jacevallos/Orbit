import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CreateProjectForm } from "@/components/CreateProjectForm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { contextBlocks: true, prompts: true } },
    },
  });

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-zinc-400 mt-1">
          A workspace per ongoing project. Stash reusable context, then send
          prompts that already know what they're working on.
        </p>
      </section>

      <CreateProjectForm />

      <section className="space-y-2">
        {projects.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No projects yet. Create one above.
          </p>
        ) : (
          <ul className="divide-y divide-blue-900 border border-blue-900 rounded-md bg-blue-950">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="block px-4 py-3 hover:bg-blue-900 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-zinc-500 shrink-0">
                      {p._count.contextBlocks} blocks · {p._count.prompts} prompts
                    </span>
                  </div>
                  {p.goal && (
                    <p className="text-sm text-zinc-400 mt-1 line-clamp-1">
                      {p.goal}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
