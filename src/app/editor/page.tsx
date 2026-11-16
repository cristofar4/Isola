import type { Metadata } from "next";
import { GuestEditor } from "@/components/editor/to-studio";

export const metadata: Metadata = {
  title: "Editor",
  description: "Remove backgrounds on your device, refine edges and export at full resolution.",
};

/** The editor for guests; signed in, it moves you to the editor inside your studio. */
export default function EditorPage() {
  return <GuestEditor />;
}
