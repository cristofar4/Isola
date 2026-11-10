"use client";

import { useEffect, useState } from "react";
import type { Project, ProjectVersion } from "@/lib/studio/project-model";
import { previewProject } from "@/lib/studio/projects";

/** A preview of a project's master (version null) or a version, redrawn when the look changes. */
export function useProjectPreview(project: Project | null, version: ProjectVersion | null, maxSide = 420): string | null {
  const key = project ? `${project.id}:${project.maskKey}:${JSON.stringify(project.look)}:${version ? JSON.stringify(version) : "master"}:${maxSide}` : "";
  const [state, setState] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!project?.maskKey) return;
    let alive = true;
    let made: string | null = null;
    void previewProject(project, version, maxSide).then((blob) => {
      if (!alive || !blob) return;
      made = URL.createObjectURL(blob);
      setState({ key, url: made });
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` summarises what's drawn
  }, [key]);
  return state?.key === key ? state.url : null;
}

/** "today at 10:24", "yesterday", or a date. */
export function editedText(ms: number) {
  const d = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff <= 0) return `today at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if (diff === 1) return "yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}
