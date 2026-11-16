import type { Metadata } from "next";
import { EditorShell } from "@/components/editor/editor-shell";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = {
  title: "Image editor · Studio",
  description: "Remove backgrounds on your device, refine edges and export, inside your studio.",
  robots: { index: false },
};

/** The image editor inside the studio frame: the sidebar, search and Create stay in reach, and Back returns to where you were. */
export default function StudioEditorPage() {
  return (
    <StudioGate path="/studio/editor" label="the image editor">
      <EditorShell embedded />
    </StudioGate>
  );
}
