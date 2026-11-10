import type { ReactNode } from "react";
import { StudioShell } from "@/components/studio/studio-shell";

/** The signed-in studio: its own frame (sidebar and top bar) instead of the marketing site's header. */
export default function StudioLayout({ children }: { children: ReactNode }) {
  return <StudioShell>{children}</StudioShell>;
}
