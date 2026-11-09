"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useProject } from "@/lib/project/store";
import { useEditorUI, type EditorIntent } from "./editor-ui-store";

function intentFrom(params: URLSearchParams): EditorIntent | null {
  const tool = params.get("tool");
  if (tool === "restore" || tool === "erase") return "restore";
  if (tool === "crop") return "crop";
  if (params.get("panel") === "background") return "background";
  return null;
}

/**
 * Reads ?tool= / ?panel= from Tools menu links. The matching tool is selected
 * as soon as the active image is ready (immediately if it already is).
 */
export function EditorIntentFromUrl() {
  const params = useSearchParams();
  const intent = intentFrom(params);
  const setIntent = useEditorUI((s) => s.setIntent);
  useEffect(() => {
    setIntent(intent);
  }, [intent, setIntent]);
  return null;
}

export function ApplyEditorIntent() {
  const ready = useProject((s) => s.images.find((i) => i.id === s.activeId)?.status === "ready");
  const intent = useEditorUI((s) => s.intent);
  const pending = useEditorUI((s) => s.intentPending);
  useEffect(() => {
    if (!ready || !pending || !intent) return;
    const ui = useEditorUI.getState();
    if (intent === "restore") ui.setTool("restore");
    if (intent === "crop") ui.setTool("crop");
    // "background" is handled by the Background section, which scrolls itself into view.
    if (intent !== "background") ui.clearIntentPending();
  }, [ready, pending, intent]);
  return null;
}

export const INTENT_HINT: Record<EditorIntent, { title: string; text: string }> = {
  restore: {
    title: "Restore & erase",
    text: "Once the background is removed, the restore brush is selected. Paint to bring back detail, or switch to Erase to clean up.",
  },
  background: {
    title: "Change background",
    text: "Once the background is removed, pick a colour or upload your own image in the Background panel.",
  },
  crop: {
    title: "Resize & crop",
    text: "Once the background is removed, the crop tool opens. Choose a ratio, then set the exact size when you export.",
  },
};
