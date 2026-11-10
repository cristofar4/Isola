import type { Metadata } from "next";
import { ProjectsPage } from "@/components/studio/projects-page";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = { title: "Projects · Studio", description: "Every collection, organised and ready to continue.", robots: { index: false } };

export default function Projects() {
  return (
    <StudioGate path="/studio/projects" label="projects">
      <ProjectsPage />
    </StudioGate>
  );
}
