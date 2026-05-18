import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";

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

  return <ProjectWorkspace project={project} />;
}
