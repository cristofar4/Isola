"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function SignedInNotice({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink-3">
        You&apos;re signed in as <span className="font-semibold text-ink">{name || email}</span>
        {name && <span className="text-muted"> ({email})</span>}.
      </p>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/account">Go to your account</ButtonLink>
        <Button
          variant="secondary"
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
          }}
        >
          Sign out
        </Button>
      </div>
      <Link href="/editor" className="text-sm font-medium text-blue-700 underline underline-offset-2">
        Open the editor
      </Link>
    </div>
  );
}
