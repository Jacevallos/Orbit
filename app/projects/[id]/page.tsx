import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ContextVault } from "@/components/ContextVault";
import { PromptComposer } from "@/components/PromptComposer";
import { PromptHistory } from "@/components/PromptHistory";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export default async function ProjectPage({ params }: PageProps) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      contextBlocks: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] },
      prompts: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!project) notFound();

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        {project.goal && <p className="text-sm text-zinc-600">{project.goal}</p>}
        {project.description && (
          <p className="text-sm text-zinc-500">{project.description}</p>
        )}
      </header>

      <section className="grid gap-8 lg:grid-cols-2">
        <ContextVault projectId={project.id} blocks={project.contextBlocks} />
        <PromptComposer
          projectId={project.id}
          blocks={project.contextBlocks}
        />
      </section>

      <PromptHistory prompts={project.prompts} />
    </div>
  );
}
