import type { Metadata } from "next";
import { MotionStudio } from "@/components/motion/motion-studio";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = { title: "Film · Motion Studio", description: "Animate your product scenes and export video.", robots: { index: false } };

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MotionStudio id={id} />;
}

/** The film editor, inside the studio frame (sidebar, search and Create stay in reach). */
export default function FilmPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <StudioGate path="/studio/motion" label="Motion Studio">
      <Editor params={params} />
    </StudioGate>
  );
}
