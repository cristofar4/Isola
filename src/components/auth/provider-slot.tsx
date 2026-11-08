import { connection } from "next/server";
import { authConfigurationProblem, enabledSocialProviders } from "@/server/auth";
import { SocialButtons } from "./social-buttons";

/** Reads provider configuration at request time so it can change without a rebuild. */
export async function ProviderSlot({ mode }: { mode: "sign-in" | "sign-up" }) {
  await connection();
  const problem = authConfigurationProblem();
  if (problem) {
    return (
      <div role="alert" className="mb-4 rounded-[10px] border border-warn/25 bg-warn-50 px-3 py-2.5 text-[13px] text-warn">
        Accounts aren&apos;t configured on this deployment yet, so signing in won&apos;t work. ({problem})
      </div>
    );
  }
  return <SocialButtons providers={enabledSocialProviders()} mode={mode} />;
}
