import type { Metadata } from "next";
import { DownloadsPage } from "@/components/studio/downloads-page";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = { title: "Downloads · Studio", robots: { index: false } };

export default function Downloads() {
  return (
    <StudioGate path="/studio/downloads" label="downloads">
      <DownloadsPage />
    </StudioGate>
  );
}
