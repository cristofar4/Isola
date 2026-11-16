"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { ACCEPT_ATTRIBUTE } from "@/lib/config";
import { importFiles, warmEngine } from "@/lib/project/actions";
import type { Sample } from "@/lib/samples";
import { loadTrial, useTrial } from "@/lib/trial";

export interface UploadIssue {
  name: string;
  message: string;
}

/**
 * The single upload path used by every entry point: validates files, adds
 * them to the project (original preserved) and opens the editor.
 *
 * With `requireAccount` (the marketing pages), a signed-out visitor goes
 * straight to the editor while they have free tries (example photos are
 * always free); once the tries are used, they're asked to create a free
 * account instead of picking a file, and come back to the editor afterwards.
 * Inside the editor, uploads always work and wait there for an account.
 */
export function useUpload({ navigateTo: requested = "/editor", requireAccount = false }: { navigateTo?: string | null; requireAccount?: boolean } = {}) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  // Signed in, the editor is the one inside your studio.
  const navigateTo = requested === "/editor" && session ? "/studio/editor" : requested;
  const trial = useTrial();
  const signedOut = requireAccount && !isPending && !session;
  useEffect(() => {
    if (signedOut) void loadTrial();
  }, [signedOut]);
  // Have the editor's code ready before the photo is chosen, so opening it is instant.
  useEffect(() => {
    if (navigateTo && !isPending) router.prefetch(navigateTo);
  }, [navigateTo, isPending, router]);
  // While the session or trial loads, behave as before: the editor checks again before removing anything.
  const trialKnown = trial.status === "ready" || trial.status === "unavailable";
  const noTrial = trialKnown && !trial.enabled;
  const triesLeft = trial.enabled ? trial.remaining : 0;
  const mustSignIn = signedOut && trialKnown && (noTrial || triesLeft === 0);
  const signInFirst = useCallback(() => {
    const next = encodeURIComponent(navigateTo ?? "/editor");
    // Out of free tries: the next step is a free account. Without guest tries at all: sign in, as before.
    router.push(noTrial ? `/sign-in?next=${next}&reason=upload` : `/sign-up?next=${next}&reason=trial`);
  }, [navigateTo, router, noTrial]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "checking" | "opening">("idle");
  const [issues, setIssues] = useState<UploadIssue[]>([]);

  // When the route is hidden (Next.js keeps it mounted in an Activity), reset.
  useEffect(() => () => setState("idle"), []);

  const handleFiles = useCallback(
    async (files: File[], options: { sample?: boolean } = {}) => {
      if (files.length === 0) return;
      if (mustSignIn && !options.sample) {
        signInFirst();
        return;
      }
      setIssues([]);
      setState("checking");
      void warmEngine();
      const report = await importFiles(files, { sample: options.sample });
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
      // Example photos don't use a free try; without guest tries at all, they need an account like everything else.
      if (signedOut && noTrial) {
        signInFirst();
        return;
      }
      setIssues([]);
      setState("checking");
      // The model starts getting ready while the example photo downloads.
      void warmEngine();
      try {
        const response = await fetch(sample.src);
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        await handleFiles([new File([blob], sample.fileName, { type: blob.type || "image/jpeg" })], { sample: true });
      } catch {
        setIssues([{ name: sample.label, message: "The sample image couldn't be loaded." }]);
        setState("idle");
      }
    },
    [handleFiles, signedOut, noTrial, signInFirst],
  );

  const openPicker = useCallback(() => {
    if (mustSignIn) {
      signInFirst();
      return;
    }
    inputRef.current?.click();
    // Choosing a photo takes a few seconds: use them to get the engine ready.
    void warmEngine();
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

  /** For guests: free tries left (null when signed in, still loading, or guest tries are off). */
  const guestTries = signedOut && trial.status === "ready" && trial.enabled ? { left: triesLeft, limit: trial.limit } : null;
  return { inputProps, openPicker, handleFiles, trySample, state, busy: state !== "idle", issues, clearIssues: () => setIssues([]), mustSignIn, guestTries, signedIn: !isPending && !!session };
}
