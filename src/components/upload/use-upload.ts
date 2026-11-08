"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ACCEPT_ATTRIBUTE } from "@/lib/config";
import { importFiles } from "@/lib/project/actions";
import type { Sample } from "@/lib/samples";

export interface UploadIssue {
  name: string;
  message: string;
}

/**
 * The single upload path used by every entry point: validates files, adds
 * them to the project (original preserved) and opens the editor.
 */
export function useUpload({ navigateTo = "/editor" }: { navigateTo?: string | null } = {}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "checking" | "opening">("idle");
  const [issues, setIssues] = useState<UploadIssue[]>([]);

  // When the route is hidden (Next.js keeps it mounted in an Activity), reset.
  useEffect(() => () => setState("idle"), []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIssues([]);
      setState("checking");
      const report = await importFiles(files);
      setIssues(report.rejected.map((r) => ({ name: r.name, message: r.error.message })));
      if (report.accepted.length > 0 && navigateTo) {
        setState("opening");
        router.push(navigateTo);
      } else {
        setState("idle");
      }
      return report;
    },
    [navigateTo, router],
  );

  const trySample = useCallback(
    async (sample: Sample) => {
      setIssues([]);
      setState("checking");
      try {
        const response = await fetch(sample.src);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        await handleFiles([new File([blob], sample.fileName, { type: blob.type || "image/jpeg" })]);
      } catch {
        setIssues([{ name: sample.label, message: "The sample image couldn't be loaded." }]);
        setState("idle");
      }
    },
    [handleFiles],
  );

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      void handleFiles(files);
    },
    [handleFiles],
  );

  const inputProps = {
    ref: inputRef,
    type: "file" as const,
    accept: ACCEPT_ATTRIBUTE,
    multiple: true,
    onChange: onInputChange,
    className: "sr-only",
    tabIndex: -1,
    "aria-hidden": true as const,
  };

  return { inputProps, openPicker, handleFiles, trySample, state, busy: state !== "idle", issues, clearIssues: () => setIssues([]) };
}
