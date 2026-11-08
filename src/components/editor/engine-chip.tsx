"use client";

import { Popover } from "radix-ui";
import { Cpu, Server } from "lucide-react";
import { formatBytes } from "@/lib/config";
import { cn } from "@/lib/cn";
import { MODELS } from "@/lib/processing/models";
import { useEngineState } from "@/lib/processing/registry";
import { useProject } from "@/lib/project/store";
import { engineSummary } from "./engine-text";

export function EngineChip({ className }: { className?: string }) {
  const engineId = useProject((s) => s.engineId);
  const state = useEngineState(engineId);
  const server = engineId.startsWith("server");
  const model = server ? null : MODELS[engineId.slice(7) as keyof typeof MODELS];
  const dot =
    state.kind === "ready"
      ? "bg-success"
      : state.kind === "unavailable" || state.kind === "error"
        ? "bg-danger"
        : state.kind === "idle"
          ? "bg-subtle"
          : "bg-blue animate-pulse";
  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-full border border-line bg-paper px-3 text-xs font-medium text-ink hover:border-line-strong",
          className,
        )}
      >
        <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
        {server ? "Server" : "On-device"} · {engineSummary(state)}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[320px] animate-scale-in rounded-[14px] border border-line bg-surface p-4 text-sm shadow-[var(--shadow-float)]"
        >
          <p className="flex items-center gap-2 font-semibold">
            {server ? <Server className="size-4" aria-hidden="true" /> : <Cpu className="size-4" aria-hidden="true" />}
            {server ? "Server processing" : `On-device · ${model?.label}`}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {server
              ? "Images are uploaded to this site's server and forwarded to the configured provider. They are not stored by ISOLA."
              : "Background removal runs in this browser with ONNX Runtime. Your images are not uploaded; only the model file is downloaded."}
          </p>
          {model && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              <dt className="text-muted">Model</dt>
              <dd>{model.provenance}</dd>
              <dt className="text-muted">Licence</dt>
              <dd>{model.license}</dd>
              <dt className="text-muted">Download</dt>
              <dd>{formatBytes(model.bytes)}, cached after first use</dd>
              <dt className="text-muted">Status</dt>
              <dd>{engineSummary(state)}</dd>
            </dl>
          )}
          {(state.kind === "unavailable" || state.kind === "error") && (
            <p className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger">{state.message}</p>
          )}
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
