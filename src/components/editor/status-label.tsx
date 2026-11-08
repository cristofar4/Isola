import { AlertTriangle, CircleCheck, Clock, Loader2, Ban, Lock } from "lucide-react";
import type { ImageStatus } from "@/lib/project/store";
import { cn } from "@/lib/cn";

const map: Record<ImageStatus, { label: string; icon: React.ElementType; className: string }> = {
  decoding: { label: "Preparing", icon: Loader2, className: "text-muted [&>svg]:animate-spin" },
  queued: { label: "Queued", icon: Clock, className: "text-muted" },
  "needs-auth": { label: "Sign in required", icon: Lock, className: "text-blue-700" },
  processing: { label: "Removing background", icon: Loader2, className: "text-blue-700 [&>svg]:animate-spin" },
  ready: { label: "Ready", icon: CircleCheck, className: "text-success" },
  error: { label: "Failed", icon: AlertTriangle, className: "text-danger" },
  cancelled: { label: "Cancelled", icon: Ban, className: "text-muted" },
};

export function StatusLabel({ status, className }: { status: ImageStatus; className?: string }) {
  const s = map[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", s.className, className)}>
      <s.icon className="size-3.5" aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function StatusDot({ status }: { status: ImageStatus }) {
  const color =
    status === "ready" ? "bg-success" : status === "error" ? "bg-danger" : status === "processing" ? "bg-blue animate-pulse" : "bg-subtle";
  return <span className={cn("size-2 rounded-full ring-2 ring-white", color)} aria-hidden="true" />;
}
