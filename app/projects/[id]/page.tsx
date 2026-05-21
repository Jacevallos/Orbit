import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
  searchParams?: { conv?: string; msgIdx?: string };
}

export default async function ProjectPage({ params, searchParams }: PageProps) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      contextBlocks: { orderBy: [{ priority: "desc" }, { createdAt: "asc" }] },
      prompts: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!project) notFound();

  // If search linked to a specific conversation that isn't in the last 50, fetch it
  const convId = searchParams?.conv ?? null;
  if (convId && !project.prompts.find((p) => p.id === convId)) {
    const extra = await prisma.prompt.findUnique({
      where: { id: convId, projectId: params.id },
    });
    if (extra) project.prompts.unshift(extra);
  }

  const msgIdx = searchParams?.msgIdx !== undefined ? parseInt(searchParams.msgIdx, 10) : null;
  return <ProjectWorkspace project={project} initialConvId={convId} targetMsgIdx={Number.isFinite(msgIdx) ? msgIdx : null} />;
}
