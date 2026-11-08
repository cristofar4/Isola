import "server-only";
import { uploadLimits } from "@/lib/config";

/**
 * Entitlements boundary. No plans or prices exist yet; every visitor gets the
 * same limits the app enforces today. When billing is introduced, resolve
 * entitlements from your billing provider here instead of inventing them in
 * the UI.
 */

export interface Entitlements {
  plan: "anonymous";
  maxFileBytes: number;
  maxBatchFiles: number;
  serverProcessingPerHour: number;
}

export async function getEntitlements(_accountId: string | null): Promise<Entitlements> {
  void _accountId;
  return {
    plan: "anonymous",
    maxFileBytes: uploadLimits.maxFileBytes,
    maxBatchFiles: uploadLimits.maxBatchFiles,
    serverProcessingPerHour: Number(process.env.ISOLA_REMOTE_RATE_LIMIT_PER_HOUR || 30),
  };
}
