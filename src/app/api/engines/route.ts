import { connection } from "next/server";
import { getRemoteProvider, remoteMaxUploadBytes } from "@/server/remote-provider";

/**
 * GET /api/engines
 * Reports which processing engines this deployment can offer. Never returns
 * credentials, only whether a provider is configured.
 */
export async function GET() {
  await connection();
  const provider = getRemoteProvider();
  return Response.json(
    {
      device: { available: true, note: "On-device models run in the visitor's browser." },
      remote: {
        configured: provider !== null,
        provider: provider?.id ?? null,
        providerLabel: provider?.label ?? null,
        maxUploadBytes: provider ? remoteMaxUploadBytes() : 0,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
