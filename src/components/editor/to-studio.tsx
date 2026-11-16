"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/progress";
import { authClient } from "@/lib/auth-client";
import { EditorShell } from "./editor-shell";

/**
 * /editor is the editor for people trying ISOLA without an account. Once
 * you're signed in, the editor lives inside your studio, so this moves you
 * there, keeping the images you have open (they live in this tab) and the
 * tool or panel the link asked for. The editor here is taken down first, so
 * there's never a second copy of the canvas running out of sight.
 */
export function GuestEditor() {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const signedIn = !isPending && Boolean(data?.session);
  useEffect(() => {
    if (signedIn) router.replace(`/studio/editor${window.location.search}`);
  }, [signedIn, router]);
  if (signedIn) {
    return (
      <div className="flex h-dvh items-center justify-center gap-2 bg-paper text-muted" role="status">
        <Spinner className="text-blue" /> Opening the editor in your studio…
      </div>
    );
  }
  return <EditorShell />;
}
