import type { Metadata } from "next";
import { MotionStudio } from "@/components/motion/motion-studio";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = { title: "Motion Studio", description: "Animate your product scenes and export video.", robots: { index: false } };

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MotionStudio id={id} />;
}

/** Motion Studio takes the whole window (its own dark workspace), outside the studio sidebar. */
export default function MotionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <StudioGate path="/studio/motion" label="Motion Studio">
      <Editor params={params} />
    </StudioGate>
  );
}
