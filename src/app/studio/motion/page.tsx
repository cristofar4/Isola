import type { Metadata } from "next";
import { FilmsPage } from "@/components/motion/films-page";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = { title: "Motion Studio · Studio", description: "Short product films from your scenes.", robots: { index: false } };

export default function Page() {
  return (
    <StudioGate path="/studio/motion" label="Motion Studio">
      <FilmsPage />
    </StudioGate>
  );
}
