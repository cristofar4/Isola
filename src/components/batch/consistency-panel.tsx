"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Info, ScanSearch, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/progress";
import { applySettings, isReady, openInEditor, useBatch, type BatchItem } from "@/lib/batch/batch-store";
import { cn } from "@/lib/cn";
import { ISSUE_LABEL, TARGETS, checkCollection, flaggedCount, targetSummary, type CheckEntry, type Fix, type Issue, type Report, type TargetId } from "@/lib/consistency";
import { exportPolicy } from "@/lib/plan-policy";
import { maskStatsFor } from "@/lib/studio/mask-stats";
import { useCheckTarget } from "@/lib/studio/check-target";

export { useCheckTarget };

const blobIds = new WeakMap<Blob, number>();
let nextBlobId = 1;
function blobId(blob: Blob | null) {
  if (!blob) return 0;
  if (!blobIds.has(blob)) blobIds.set(blob, nextBlobId++);
  return blobIds.get(blob)!;
}

/** The consistency report for the finished images, recomputed when masks or settings change. */
export function useConsistencyReport(items: BatchItem[], target: TargetId | null, pro: boolean): Report | null {
  const ready = items.filter(isReady);
  const signature = ready.map((i) => `${i.id}:${blobId(i.maskBlob)}:${JSON.stringify(i.settings)}:${i.review ?? ""}`).join("|");
  const [entries, setEntries] = useState<{ signature: string; list: CheckEntry[] } | null>(null);

  useEffect(() => {
    let alive = true;
    const current = useBatch.getState().items.filter(isReady);
    void Promise.all(
      current.map(async (i) => ({
        id: i.id,
        name: i.name,
        width: i.width,
        height: i.height,
        bounds: i.bounds,
        settings: i.settings,
        review: i.review,
        stats: await maskStatsFor(i.maskBlob),
      })),
    ).then((list) => alive && setEntries({ signature, list }));
    return () => {
      alive = false;
    };
  }, [signature]);

  return useMemo(() => (entries ? checkCollection(entries.list, { target, policy: exportPolicy(pro) }) : null), [entries, target, pro]);
}

function uniqueFixes(report: Report) {
  const seen = new Set<Fix>();
  return Object.values(report.bulk).filter((f): f is Fix => {
    if (!f || seen.has(f)) return false;
    seen.add(f);
    return true;
  });
}

function TargetPicker({ target, onChange }: { target: TargetId | null; onChange: (t: TargetId | null) => void }) {
  const options: Array<{ value: TargetId | null; label: string }> = [
    { value: null, label: "Consistency" },
    { value: "amazon", label: TARGETS.amazon.label },
    { value: "instagram", label: TARGETS.instagram.label },
  ];
  return (
    <div>
      <div role="radiogroup" aria-label="Check against" className="flex flex-wrap gap-1.5 rounded-[12px] bg-paper p-1">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            role="radio"
            aria-checked={target === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "h-9 flex-1 whitespace-nowrap rounded-[9px] px-3 text-[13px] font-semibold transition-colors",
              target === o.value ? "bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-line" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-muted">
        {target
          ? `${TARGETS[target].rules} Based on published guidelines; check the destination's current rules too.`
          : "Compares each image with the rest of the batch: settings, crops, stray specks, edges, size and position."}
      </p>
    </div>
  );
}

export function ConsistencyPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const items = useBatch((s) => s.items);
  const pro = useBatch((s) => s.pro);
  const [target, setTarget] = useCheckTarget();
  const report = useConsistencyReport(items, target, pro);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const readyCount = items.filter(isReady).length;

  async function run(fix: Fix, key: string) {
    setStatus(null);
    if (fix.kind === "editor") {
      setBusy(key);
      const ok = await openInEditor(fix.id);
      setBusy(null);
      if (ok) {
        onOpenChange(false);
        router.push("/editor");
      } else setStatus("That image can't be opened in the editor right now.");
      return;
    }
    if (fix.kind !== "settings") return;
    setBusy(key);
    for (const change of fix.changes) await applySettings([change.id], change.settings);
    setBusy(null);
    setStatus(`Applied to ${fix.changes.length === 1 ? "1 image" : `${fix.changes.length} images`}. Previews and downloads use the new settings.`);
  }

  function fixButton(fix: Fix, id: string, primary = false) {
    if (fix.kind === "upgrade") {
      return (
        <Link key={id} href="/pricing?from=batch" className="inline-flex h-8 items-center rounded-[9px] border border-blue/40 px-3 text-[13px] font-semibold text-blue-700 hover:bg-blue-50">
          {fix.label}
        </Link>
      );
    }
    return (
      <Button
        key={id}
        size="sm"
        variant={primary ? "primary" : "outline-blue"}
        disabled={busy !== null}
        onClick={() => void run(fix, id)}
        icon={busy === id ? <Spinner /> : fix.kind === "editor" ? <Wand2 className="size-3.5" aria-hidden="true" /> : undefined}
      >
        {fix.label}
      </Button>
    );
  }

  const grouped = new Map<string, Issue[]>();
  for (const issue of report?.issues ?? []) if (issue.itemId) grouped.set(issue.itemId, [...(grouped.get(issue.itemId) ?? []), issue]);
  const general = report?.issues.filter((i) => !i.itemId) ?? [];
  const flagged = report ? flaggedCount(report) : 0;
  const meets = report ? targetSummary(report) : null;
  const good = report ? (meets ? meets.meets : report.issues.length === 0) : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} size="lg" title="Consistency check" description="Measured from your finished cutouts. Nothing changes until you choose a fix.">
      <div className="grid gap-5" data-consistency-panel>
        <TargetPicker target={target} onChange={setTarget} />

        {readyCount === 0 ? (
          <p className="rounded-[12px] border border-dashed border-line-strong px-4 py-6 text-center text-[14px] text-muted">
            Process some images first. The check compares finished cutouts.
          </p>
        ) : !report ? (
          <p className="flex items-center gap-2 text-[14px] text-muted">
            <Spinner /> Measuring {readyCount} cutout{readyCount === 1 ? "" : "s"}…
          </p>
        ) : (
          <>
            <div
              role="status"
              className={cn(
                "flex items-center gap-3 rounded-[12px] px-4 py-3 text-[14px]",
                good ? "bg-success-50 text-success" : "bg-warn-50 text-warn",
              )}
            >
              {good ? <CircleCheck className="size-5 shrink-0" aria-hidden="true" /> : <ScanSearch className="size-5 shrink-0" aria-hidden="true" />}
              <p className="flex-1 font-semibold" data-consistency-summary>
                {meets?.meets && target
                  ? `All ${report.checked} image${report.checked === 1 ? "" : "s"} meet the ${TARGETS[target].label} checks${meets.others ? ` · ${meets.others} other suggestion${meets.others === 1 ? "" : "s"} below` : ""}`
                  : report.issues.length
                    ? `${report.issues.length} suggestion${report.issues.length === 1 ? "" : "s"} for ${flagged || report.checked} of ${report.checked} image${report.checked === 1 ? "" : "s"}`
                    : `All ${report.checked} image${report.checked === 1 ? "" : "s"} look consistent`}
              </p>
            </div>

            {uniqueFixes(report).length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="size-4 text-blue" aria-hidden="true" />
                <span className="text-[13px] font-semibold text-ink">Fix in one go:</span>
                {uniqueFixes(report).map((fix, i) => fixButton(fix, `bulk-${i}`, true))}
              </div>
            )}
            {status && (
              <p role="status" className="text-[13px] font-medium text-success">
                {status}
              </p>
            )}

            {general.map((issue) => (
              <div key={issue.key} className="flex flex-wrap items-start gap-3 rounded-[12px] border border-warn/30 bg-warn-50/60 px-4 py-3">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{issue.title}</p>
                  <p className="text-[13px] text-ink-3">{issue.detail}</p>
                </div>
                {issue.fix && fixButton(issue.fix, issue.key)}
              </div>
            ))}

            {grouped.size > 0 && (
              <ul className="grid gap-3" aria-label="Images with suggestions">
                {[...grouped.entries()].map(([id, issues]) => {
                  const item = byId.get(id);
                  if (!item) return null;
                  return (
                    <li key={id} className="rounded-[14px] border border-line p-3 sm:p-4" data-check-item={item.name}>
                      <div className="flex items-center gap-3">
                        <span className="checkerboard-sm relative size-14 shrink-0 overflow-hidden rounded-[10px] border border-line">
                          {(item.previewUrl ?? item.thumbUrl) && (
                            // eslint-disable-next-line @next/next/no-img-element -- local object URL
                            <img src={item.previewUrl ?? item.thumbUrl ?? ""} alt="" className="size-full object-contain" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-ink">{item.name}</p>
                          <p className="flex flex-wrap gap-1.5 pt-1">
                            {issues.map((i) => (
                              <span key={i.key} className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", i.severity === "warning" ? "bg-warn-50 text-warn" : "bg-blue-50 text-blue-700")}>
                                {ISSUE_LABEL[i.kind]}
                              </span>
                            ))}
                          </p>
                        </div>
                      </div>
                      <ul className="mt-3 grid gap-2.5 border-t border-line pt-3">
                        {issues.map((issue) => (
                          <li key={issue.key} className="flex flex-wrap items-start gap-x-3 gap-y-2">
                            {issue.severity === "warning" ? (
                              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
                            ) : (
                              <Info className="mt-0.5 size-4 shrink-0 text-blue" aria-hidden="true" />
                            )}
                            <div className="min-w-0 flex-1 basis-60">
                              <p className="text-[14px] font-semibold text-ink">{issue.title}</p>
                              <p className="text-[13px] leading-relaxed text-ink-3">{issue.detail}</p>
                            </div>
                            {issue.fix && fixButton(issue.fix, issue.key)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
