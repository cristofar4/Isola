import { connection } from "next/server";
import { authConfigurationProblem, enabledSocialProviders } from "@/server/auth";
import { SocialButtons } from "./social-buttons";

/** Warns when accounts can't work on this deployment. Read at request time so it can change without a rebuild. */
export async function AuthSetupNotice() {
  await connection();
  const problem = authConfigurationProblem();
  if (!problem) return null;
  return (
    <div role="alert" className="mb-5 rounded-[12px] border border-warn/25 bg-warn-50 px-3.5 py-3 text-[13px] leading-relaxed text-warn">
      Accounts aren&apos;t configured on this deployment yet, so signing in won&apos;t work. ({problem})
    </div>
  );
}

/** "or" and a button per configured provider (Google, GitHub); nothing when none is configured. */
export async function ProviderSlot({ mode }: { mode: "sign-in" | "sign-up" }) {
  await connection();
  if (authConfigurationProblem()) return null;
  return <SocialButtons providers={enabledSocialProviders()} mode={mode} />;
}
