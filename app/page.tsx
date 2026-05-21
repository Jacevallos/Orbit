import { prisma } from "@/lib/prisma";
import { CreateProjectForm } from "@/components/CreateProjectForm";
import { ProjectList } from "@/components/ProjectList";
import { SpaceBackground } from "@/components/SpaceBackground";
import { RouteRefresher } from "@/components/RouteRefresher";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { contextBlocks: true, prompts: true } },
    },
  });

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
      <SpaceBackground />
      <RouteRefresher />
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-zinc-400 mt-1">
          A workspace per ongoing project. Stash reusable context, then send
          prompts that already know what they're working on.
        </p>
      </section>

      <CreateProjectForm />

      <section className="space-y-2">
        <ProjectList projects={projects} />
      </section>
    </div>
    </div>
  );
}
