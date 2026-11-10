import type { Metadata } from "next";
import { AssetLibrary } from "@/components/studio/asset-library";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = { title: "Asset library · Studio", description: "Your originals, cutouts, backgrounds and logos.", robots: { index: false } };

export default function AssetsPage() {
  return (
    <StudioGate path="/studio/assets" label="your library">
      <AssetLibrary />
    </StudioGate>
  );
}
