"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { authClient } from "@/lib/auth-client";
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
 *
 * With `requireAccount` (the marketing pages), a visitor who is signed out is
 * sent to sign in first instead of picking a file; afterwards they land in
 * the editor. Inside the editor, uploads still work signed out and wait there.
 */
export function useUpload({ navigateTo = "/editor", requireAccount = false }: { navigateTo?: string | null; requireAccount?: boolean } = {}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  // Only redirect when we know the visitor is signed out; while the session loads, behave as before.
  const mustSignIn = requireAccount && !isPending && !session;
  const signInFirst = useCallback(() => {
    router.push(`/sign-in?next=${encodeURIComponent(navigateTo ?? "/editor")}&reason=upload`);
  }, [navigateTo, router]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "checking" | "opening">("idle");
  const [issues, setIssues] = useState<UploadIssue[]>([]);

  // When the route is hidden (Next.js keeps it mounted in an Activity), reset.
  useEffect(() => () => setState("idle"), []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      if (mustSignIn) {
        signInFirst();
        return;
      }
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
    [navigateTo, router, mustSignIn, signInFirst],
  );

  const trySample = useCallback(
    async (sample: Sample) => {
      if (mustSignIn) {
        signInFirst();
        return;
      }
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
    [handleFiles, mustSignIn, signInFirst],
  );

  const openPicker = useCallback(() => {
    if (mustSignIn) signInFirst();
    else inputRef.current?.click();
  }, [mustSignIn, signInFirst]);

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

  return { inputProps, openPicker, handleFiles, trySample, state, busy: state !== "idle", issues, clearIssues: () => setIssues([]), mustSignIn };
}
