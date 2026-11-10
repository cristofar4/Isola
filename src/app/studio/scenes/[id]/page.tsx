import type { Metadata } from "next";
import { SceneEditor } from "@/components/scene/scene-editor";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = { title: "Scene · Studio", robots: { index: false } };

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SceneEditor id={id} />;
}

export default function ScenePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <StudioGate path="/studio/scenes" label="the scene">
      <Editor params={params} />
    </StudioGate>
  );
}
