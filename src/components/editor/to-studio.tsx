"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * /editor is the editor for people trying ISOLA without an account. Once
 * you're signed in, the editor lives inside your studio, so this moves you
 * there, keeping the images you have open (they live in this tab) and the
 * tool or panel the link asked for.
 */
export function ToStudioWhenSignedIn() {
  const router = useRouter();
  const { data, isPending } = authClient.useSession();
  const signedIn = !isPending && Boolean(data?.session);
  useEffect(() => {
    if (signedIn) router.replace(`/studio/editor${window.location.search}`);
  }, [signedIn, router]);
  return null;
}
