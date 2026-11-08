import type { Metadata } from "next";
import { EditorShell } from "@/components/editor/editor-shell";

export const metadata: Metadata = {
  title: "Editor",
  description: "Remove backgrounds on your device, refine edges and export at full resolution.",
};

export default function EditorPage() {
  return <EditorShell />;
}
