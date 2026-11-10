"use client";

import { Check, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/progress";
import { exportSet, isReady, previewWith, useBatch } from "@/lib/batch/batch-store";
import { cn } from "@/lib/cn";
import { planConfig } from "@/lib/config";
import { DEFAULT_DESTINATIONS, DESTINATIONS, destinationSettings, type DestinationId } from "@/lib/export-sets";

const KEY = "isola:export-set";

function savedDestinations(): DestinationId[] {
  if (typeof window === "undefined") return DEFAULT_DESTINATIONS;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as unknown;
    if (Array.isArray(saved)) {
      const valid = saved.filter((id): id is DestinationId => DESTINATIONS.some((d) => d.id === id));
      if (valid.length) return valid;
    }
  } catch {
    // Not remembered.
  }
  return DEFAULT_DESTINATIONS;
}

/** Chosen destinations, remembered in this browser. Only shown inside the open dialog, so reading storage on first render is safe. */
function useDestinations(): [DestinationId[], (next: DestinationId[]) => void] {
  const [chosen, setChosen] = useState<DestinationId[]>(savedDestinations);
  return [
    chosen,
    (next) => {
      setChosen(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Not remembered.
      }
    },
  ];
}

/** Real previews of one image at every destination, drawn by the export renderer. */
function usePreviews(itemId: string | null, settingsKey: string) {
  const [urls, setUrls] = useState<Partial<Record<DestinationId, string>>>({});
  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    const made: string[] = [];
    void (async () => {
      const item = useBatch.getState().items.find((i) => i.id === itemId);
      if (!item) return;
      for (const dest of DESTINATIONS) {
        const blob = await previewWith(itemId, destinationSettings(item.settings, dest), 200);
        if (!alive) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          made.push(url);
          setUrls((u) => ({ ...u, [dest.id]: url }));
        }
      }
    })();
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
      setUrls({});
    };
  }, [itemId, settingsKey]);
  return urls;
}

export function ExportSetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const items = useBatch((s) => s.items);
  const selected = useBatch((s) => s.selected);
  const exporting = useBatch((s) => s.exporting);
  const pro = useBatch((s) => s.pro);
  const [chosen, setChosen] = useDestinations();
  const readyAll = items.filter(isReady);
  const selectedReady = readyAll.filter((i) => selected.includes(i.id));
  const [scope, setScope] = useState<"all" | "selected">("all");
  const useSelected = scope === "selected" && selectedReady.length > 0;
  const targets = useSelected ? selectedReady : readyAll;
  const sample = targets[0] ?? null;
  const previews = usePreviews(open ? (sample?.id ?? null) : null, sample ? JSON.stringify(sample.settings) : "");
  const files = targets.length * chosen.length;

  function toggle(id: DestinationId) {
    setChosen(chosen.includes(id) ? chosen.filter((c) => c !== id) : DESTINATIONS.filter((d) => d.id === id || chosen.includes(d.id)).map((d) => d.id));
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Export set"
      description="One collection, every destination: each finished image sized for every place you'll use it, in one ZIP."
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted" aria-live="polite" data-export-set-summary>
            {targets.length === 0
              ? "No finished images yet."
              : chosen.length === 0
                ? "Choose at least one destination."
                : `${targets.length} image${targets.length === 1 ? "" : "s"} × ${chosen.length} destination${chosen.length === 1 ? "" : "s"} = ${files} file${files === 1 ? "" : "s"}`}
            {!pro && targets.length > 0 && ` · Free: up to ${planConfig.freeMaxExportSide.toLocaleString("en-US")}px with a watermark`}
          </p>
          <Button
            disabled={targets.length === 0 || chosen.length === 0 || exporting !== null}
            onClick={() => {
              void exportSet(
                targets.map((t) => t.id),
                chosen,
              );
              onOpenChange(false);
            }}
            icon={exporting ? <Spinner /> : <Download className="size-4" aria-hidden="true" />}
          >
            Download export set
          </Button>
        </div>
      }
    >
      <div className="grid gap-5" data-export-set>
        {selectedReady.length > 0 && (
          <div role="radiogroup" aria-label="Images" className="flex flex-wrap gap-2">
            {(
              [
                ["all", `All finished (${readyAll.length})`],
                ["selected", `Selected (${selectedReady.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                onClick={() => setScope(value)}
                className={cn(
                  "h-9 rounded-full border px-3.5 text-[13px] font-semibold",
                  scope === value ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-3 hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <fieldset>
          <legend className="text-[13px] font-semibold text-ink">Destinations</legend>
          <ul className="mt-2 grid gap-2.5 sm:grid-cols-2">
            {DESTINATIONS.map((d) => {
              const on = chosen.includes(d.id);
              const ratio = d.width / d.height;
              return (
                <li key={d.id}>
                  <label
                    className={cn(
                      "flex h-full cursor-pointer items-center gap-3 rounded-[14px] border p-3 transition-colors",
                      on ? "border-blue bg-blue-50/60" : "border-line hover:border-line-strong",
                    )}
                  >
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(d.id)} />
                    <span className="flex size-[72px] shrink-0 items-center justify-center rounded-[10px] bg-paper">
                      <span
                        className="checkerboard-sm relative overflow-hidden rounded-[4px] border border-line"
                        style={{ width: ratio >= 1 ? 64 : Math.round(64 * ratio), height: ratio >= 1 ? Math.round(64 / ratio) : 64 }}
                      >
                        {previews[d.id] && (
                          // eslint-disable-next-line @next/next/no-img-element -- local object URL of a rendered preview
                          <img src={previews[d.id]} alt="" className="absolute inset-0 size-full object-contain" />
                        )}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-ink">{d.label}</span>
                      <span className="block text-[12px] tabular-nums text-muted">
                        {d.width.toLocaleString("en-US")} × {d.height.toLocaleString("en-US")} px
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{d.use}</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-[6px] border", on ? "border-blue bg-blue text-white" : "border-line-strong bg-surface")}
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <p className="text-[12px] leading-relaxed text-muted">
          Each destination keeps every image&apos;s own look (background, padding, shadow) and changes only the canvas; the marketplace size also
          uses a pure white JPEG. Files go in a folder per destination, named like your downloads.
          {sample && " Previews show the first image."}
        </p>
      </div>
    </Sheet>
  );
}
