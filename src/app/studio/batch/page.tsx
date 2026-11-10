import type { Metadata } from "next";
import { BatchStudio } from "@/components/batch/batch-studio";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = {
  title: "Batch Studio · Studio",
  description: "Remove backgrounds from a whole set of images, give them one consistent look and export them together.",
  robots: { index: false },
};

/** Batch Studio inside the studio frame, so the sidebar and top bar stay with you. */
export default function StudioBatchPage() {
  return (
    <StudioGate path="/studio/batch" label="Batch Studio">
      <BatchStudio />
    </StudioGate>
  );
}
