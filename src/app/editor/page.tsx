import type { Metadata } from "next";
import { EditorShell } from "@/components/editor/editor-shell";
import { ToStudioWhenSignedIn } from "@/components/editor/to-studio";

export const metadata: Metadata = {
  title: "Editor",
  description: "Remove backgrounds on your device, refine edges and export at full resolution.",
};

export default function EditorPage() {
  return (
    <>
      <EditorShell />
      <ToStudioWhenSignedIn />
    </>
  );
}
