import type { Metadata } from "next";
import { ScenesPage } from "@/components/scene/scenes-page";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = { title: "Scene Studio · Studio", description: "Compose products on backdrops with real shadows, in every format.", robots: { index: false } };

export default function Page() {
  return (
    <StudioGate path="/studio/scenes" label="Scene Studio">
      <ScenesPage />
    </StudioGate>
  );
}
