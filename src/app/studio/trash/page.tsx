import type { Metadata } from "next";
import { StudioGate } from "@/components/studio/studio-gate";
import { TrashPage } from "@/components/studio/trash-page";

export const metadata: Metadata = { title: "Trash · Studio", robots: { index: false } };

export default function Trash() {
  return (
    <StudioGate path="/studio/trash" label="the trash">
      <TrashPage />
    </StudioGate>
  );
}
