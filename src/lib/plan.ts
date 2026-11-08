"use client";

import { authClient } from "./auth-client";

export interface ClientPlan {
  signedIn: boolean;
  pro: boolean;
  proUntil: Date | null;
  renews: boolean;
}

type PlanUser = { proUntil?: string | Date | null; proRenews?: boolean | null };

export function planFromUser(user: PlanUser | null | undefined): Omit<ClientPlan, "signedIn"> {
  const until = user?.proUntil ? new Date(user.proUntil) : null;
  const pro = Boolean(until && until.getTime() > Date.now());
  return { pro, proUntil: until, renews: pro && Boolean(user?.proRenews) };
}

/** The visitor's plan, from the live session. */
export function usePlan(): ClientPlan & { isPending: boolean } {
  const { data, isPending } = authClient.useSession();
  return { signedIn: Boolean(data?.session), isPending, ...planFromUser(data?.user as PlanUser | undefined) };
}
