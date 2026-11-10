import type { Metadata } from "next";
import { ProjectBoard } from "@/components/studio/project-board";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = { title: "Project · Studio", robots: { index: false } };

async function Board({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectBoard id={id} />;
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <StudioGate path="/studio/projects" label="the project">
      <Board params={params} />
    </StudioGate>
  );
}
