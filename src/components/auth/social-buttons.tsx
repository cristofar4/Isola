"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { BrandIcon, GoogleIcon } from "@/components/ui/brand-icons";
import { Spinner } from "@/components/ui/progress";
import { authClient, authErrorMessage, safeNext } from "@/lib/auth-client";
import type { SocialProvider } from "@/server/auth";
import { FormAlert, OrDivider } from "./fields";

const labels: Record<SocialProvider, string> = { google: "Google", github: "GitHub" };

export function SocialButtons({ providers, mode }: { providers: SocialProvider[]; mode: "sign-in" | "sign-up" }) {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [pending, setPending] = useState<SocialProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: session } = authClient.useSession();
  if (providers.length === 0 || session) return null;

  async function go(provider: SocialProvider) {
    setPending(provider);
    setError(null);
    const errorPage = mode === "sign-in" ? "/sign-in" : "/sign-up";
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: next,
      newUserCallbackURL: next,
      errorCallbackURL: `${errorPage}?next=${encodeURIComponent(next)}`,
    });
    // On success the browser is redirected to the provider.
    if (error) {
      setError(authErrorMessage(error));
      setPending(null);
    }
  }

  return (
    <div className="grid gap-4">
      <OrDivider />
      <div className="grid gap-2.5">
        {providers.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => void go(provider)}
            disabled={pending !== null}
            className="inline-flex h-12 items-center justify-center gap-2.5 rounded-[12px] border border-line-strong bg-surface text-[15px] font-semibold text-ink transition-colors hover:border-ink/40 hover:bg-paper disabled:opacity-60"
          >
            {pending === provider ? (
              <Spinner />
            ) : provider === "google" ? (
              <GoogleIcon className="size-[18px]" />
            ) : (
              <BrandIcon network="github" className="size-[18px]" />
            )}
            Continue with {labels[provider]}
          </button>
        ))}
      </div>
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  );
}
