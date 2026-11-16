"use client";

import { useSyncExternalStore } from "react";

/**
 * Small pieces of studio state shared between the frame and the page inside it:
 * whether the image editor is open (it wants the sidebar folded to give the
 * canvas room) and the last studio page you were on (the editor's Back button).
 */

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

let editorOpen = false;
export function setEditorOpen(open: boolean) {
  if (editorOpen === open) return;
  editorOpen = open;
  notify();
}
export function useEditorOpen() {
  return useSyncExternalStore(
    subscribe,
    () => editorOpen,
    () => false,
  );
}

/** Studio pages by path prefix (most specific first), for the breadcrumb and Back buttons. */
export const STUDIO_PAGES: Array<[string, string]> = [
  ["/studio/editor", "Image editor"],
  ["/studio/batch", "Batch Studio"],
  ["/studio/scenes/", "Scene"],
  ["/studio/scenes", "Scene Studio"],
  ["/studio/motion/", "Film"],
  ["/studio/motion", "Motion Studio"],
  ["/studio/projects/", "Project"],
  ["/studio/projects", "Projects"],
  ["/studio/assets", "Asset library"],
  ["/studio/presets", "Brand presets"],
  ["/studio/downloads", "Downloads"],
  ["/studio/trash", "Trash"],
  ["/studio/plans", "Plans"],
  ["/studio/settings", "Settings"],
  ["/studio/help", "Help"],
];

export function studioPageName(pathname: string) {
  return STUDIO_PAGES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Home";
}

const LAST_KEY = "isola-studio-last";

/** Remembers the studio page you were on (not the editor itself), for this tab. */
export function rememberStudioPlace(pathname: string) {
  if (!pathname.startsWith("/studio") || pathname.startsWith("/studio/editor")) return;
  try {
    if (sessionStorage.getItem(LAST_KEY) === pathname) return;
    sessionStorage.setItem(LAST_KEY, pathname);
  } catch {
    return; // Storage blocked: Back goes to the studio home.
  }
  notify();
}

function readLast() {
  try {
    return sessionStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Where the editor's Back button goes: the studio page you came from, or the studio home. */
export function useStudioBack(): { href: string; label: string } {
  const last = useSyncExternalStore(subscribe, readLast, () => null);
  const href = last && last.startsWith("/studio") ? last : "/studio";
  return { href, label: studioPageName(href) };
}
