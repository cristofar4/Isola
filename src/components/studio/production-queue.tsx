"use client";

import Link from "next/link";
import { CircleAlert, CircleCheck, Clock3, Layers, Lock, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { BatchSnapshot, SnapshotItem } from "@/lib/studio/snapshot";
import { useOriginalThumbs } from "./use-studio-data";

type Row = { item: SnapshotItem; state: "review" | "failed" | "waiting" | "ready" };

function rowsFor(snapshot: BatchSnapshot): Row[] {
  const rank: Record<Row["state"], number> = { review: 0, failed: 1, waiting: 2, ready: 3 };
  return snapshot.items
    .map((item): Row => ({
      item,
      state: item.status === "ready" ? (item.review ? "review" : "ready") : item.status === "failed" ? "failed" : "waiting",
    }))
    .sort((a, b) => rank[a.state] - rank[b.state]);
}

const STATE: Record<Row["state"], { label: string; icon: ReactNode; tone: string }> = {
  review: { label: "Refine edges", icon: <TriangleAlert className="size-3.5" aria-hidden="true" />, tone: "text-warn" },
  failed: { label: "Failed", icon: <CircleAlert className="size-3.5" aria-hidden="true" />, tone: "text-danger" },
  waiting: { label: "Waiting to process", icon: <Clock3 className="size-3.5" aria-hidden="true" />, tone: "text-blue-700" },
  ready: { label: "Ready to export", icon: <CircleCheck className="size-3.5" aria-hidden="true" />, tone: "text-success" },
};

function action(row: Row) {
  if (row.state === "review") return { href: `/studio/batch?open=${encodeURIComponent(row.item.id)}`, label: "Open editor" };
  if (row.state === "ready") return { href: "/studio/batch?export=set", label: "Export" };
  return { href: "/studio/batch", label: row.state === "failed" ? "Retry" : "Open" };
}

/** What's happening in the batch saved in this browser, with the next step for each image. */
export function ProductionQueue({ snapshot, pro }: { snapshot: BatchSnapshot | null; pro: boolean }) {
  const rows = snapshot ? rowsFor(snapshot) : [];
  const shown = rows.slice(0, 3);
  const thumbs = useOriginalThumbs(
    shown.map((r) => r.item),
    3,
  );
  const counts = rows.reduce<Record<Row["state"], number>>((c, r) => ({ ...c, [r.state]: c[r.state] + 1 }), { review: 0, failed: 0, waiting: 0, ready: 0 });

  return (
    <section aria-labelledby="queue-title" className="rounded-[18px] border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2.5">
        <Layers className="size-5 text-ink" aria-hidden="true" />
        <h2 id="queue-title" className="font-display text-[20px] font-bold tracking-[-0.01em] text-ink">
          Production queue
        </h2>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 rounded-[14px] border border-dashed border-line-strong px-4 py-6 text-center">
          <p className="text-[14px] text-ink-3">Nothing in production yet.</p>
          <Link href="/studio/batch" className="mt-2 inline-flex text-[14px] font-semibold text-blue-700 hover:underline">
            Start a batch
          </Link>
        </div>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-muted" data-queue-summary>
            {snapshot!.name} · {[counts.ready && `${counts.ready} ready`, counts.review && `${counts.review} to review`, counts.waiting && `${counts.waiting} waiting`, counts.failed && `${counts.failed} failed`].filter(Boolean).join(" · ")}
          </p>
          <ul className="mt-4 grid gap-2.5" aria-label="Images in production">
            {shown.map((row, i) => {
              const s = STATE[row.state];
              const next = action(row);
              return (
                <li key={row.item.id} className="flex items-center gap-3 rounded-[14px] border border-line p-2.5" data-queue-state={row.state}>
                  <span className="size-14 shrink-0 overflow-hidden rounded-[10px] bg-paper-2">
                    {thumbs[i] && (
                      // eslint-disable-next-line @next/next/no-img-element -- local object URL
                      <img src={thumbs[i]!} alt="" className="size-full object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-ink">{row.item.name}</span>
                    <span className={cn("mt-0.5 inline-flex items-center gap-1.5 text-[13px] font-medium", s.tone)}>
                      {s.icon} {s.label}
                    </span>
                  </span>
                  <Link
                    href={next.href}
                    aria-label={`${next.label}: ${row.item.name}`}
                    className="inline-flex h-9 shrink-0 items-center rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink hover:border-ink/40 hover:bg-paper"
                  >
                    {next.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          {rows.length > shown.length && (
            <Link href="/studio/batch" className="mt-3 inline-flex text-[13px] font-semibold text-blue-700 hover:underline">
              See all {rows.length} images in Batch Studio
            </Link>
          )}
          {counts.waiting > 0 && (
            <p className="mt-3 flex gap-2 rounded-[12px] bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-ink-3">
              {pro ? <Clock3 className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden="true" /> : <Lock className="mt-0.5 size-3.5 shrink-0 text-blue" aria-hidden="true" />}
              {pro ? (
                "Images are processed on this device while Batch Studio is open."
              ) : (
                <span>
                  Batch Studio is part of Pro: these images wait in this browser.{" "}
                  <Link href="/pricing?from=batch" className="font-semibold text-blue-700 hover:underline">
                    Upgrade
                  </Link>
                </span>
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
