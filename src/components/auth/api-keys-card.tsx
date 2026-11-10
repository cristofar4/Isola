"use client";

import Link from "next/link";
import { AlertDialog } from "radix-ui";
import { ArrowUpRight, Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { planConfig } from "@/lib/config";
import { Card } from "./account-card";
import { FormAlert, TextField } from "./fields";

interface KeySummary {
  id: string;
  name: string;
  preview: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
}

const MAX_KEYS = 10;

function when(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-stretch overflow-hidden rounded-[10px] border border-line-strong bg-surface">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-3 py-2.5 font-mono text-[13px] text-ink" aria-label={label}>
        {value}
      </code>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
        className="inline-flex shrink-0 items-center gap-1.5 border-l border-line px-3 text-[13px] font-semibold text-blue-700 hover:bg-blue-50"
      >
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

/** Create, list and delete API keys. A new key is shown once and never again. */
export function ApiKeysCard({ pro }: { pro: boolean }) {
  const [keys, setKeys] = useState<KeySummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ key: string; name: string } | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/keys", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as { keys?: KeySummary[]; message?: string };
        if (!alive) return;
        if (res.ok && json.keys) setKeys(json.keys);
        else setLoadError(json.message ?? "Couldn't load your keys.");
      })
      .catch(() => alive && setLoadError("Couldn't reach the server."));
    return () => {
      alive = false;
    };
  }, [reload]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const json = (await res.json()) as { key?: string; summary?: KeySummary; message?: string };
      if (res.ok && json.key && json.summary) {
        setFresh({ key: json.key, name: json.summary.name });
        setKeys((k) => [json.summary!, ...(k ?? [])]);
        setName("");
      } else setError(json.message ?? "Couldn't create a key.");
    } catch {
      setError("Couldn't reach the server.");
    }
    setCreating(false);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setKeys((k) => (k ?? []).filter((x) => x.id !== id));
    else setError("Couldn't delete that key. Try again.");
  }

  const full = (keys?.length ?? 0) >= MAX_KEYS;
  return (
    <Card
      anchor="api-keys"
      icon={<KeyRound className="size-4" />}
      title="API keys"
      description={
        pro
          ? "Use the ISOLA API from your own code. Pro: full resolution, no watermark, masks included."
          : `Use the ISOLA API from your own code. Free: watermarked cutouts up to ${planConfig.freeMaxExportSide.toLocaleString("en-US")}px; Pro removes both limits.`
      }
    >
      <div className="grid gap-5">
        {fresh && (
          <div role="status" className="grid gap-3 rounded-[14px] border border-success/25 bg-success-50 p-4">
            <p className="text-sm font-semibold text-success">
              “{fresh.name}” is ready. Copy it now: for your security you won&apos;t be able to see it again.
            </p>
            <CopyField value={fresh.key} label="New API key" />
            <p className="text-[13px] text-ink-3">Try it:</p>
            <CopyField
              label="Example request"
              value={`curl -X POST ${typeof window === "undefined" ? "" : window.location.origin}/api/v1/remove-background -H "Authorization: Bearer ${fresh.key}" -F "image=@photo.jpg" -o cutout.png`}
            />
            <div>
              <Button size="sm" variant="secondary" onClick={() => setFresh(null)}>
                I&apos;ve saved it
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextField label="Key name" placeholder="e.g. Shop backend" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} disabled={full} />
          </div>
          <Button type="submit" disabled={creating || full || keys === null} icon={creating ? <Spinner /> : <Plus className="size-4" aria-hidden="true" />}>
            Create key
          </Button>
        </form>
        {full && <p className="-mt-2 text-[13px] text-muted">You have {MAX_KEYS} keys, the most an account can have. Delete one to create another.</p>}
        {error && <FormAlert>{error}</FormAlert>}

        {loadError ? (
          <FormAlert>
            {loadError}{" "}
            <button type="button" className="font-semibold underline" onClick={() => { setLoadError(null); setReload((n) => n + 1); }}>
              Retry
            </button>
          </FormAlert>
        ) : keys === null ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner /> Loading keys…
          </p>
        ) : keys.length === 0 ? (
          <p className="rounded-[12px] border border-dashed border-line-strong px-4 py-5 text-center text-sm text-muted">No keys yet. Create one to start using the API.</p>
        ) : (
          <ul className="divide-y divide-line rounded-[12px] border border-line" aria-label="Your API keys">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{k.name}</p>
                  <p className="font-mono text-[12px] text-muted">{k.preview}</p>
                </div>
                <dl className="grid grid-cols-3 gap-x-4 text-[12px] text-muted">
                  <div>
                    <dt>Created</dt>
                    <dd className="text-ink-3">{when(k.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Last used</dt>
                    <dd className="text-ink-3">{when(k.lastUsedAt)}</dd>
                  </div>
                  <div>
                    <dt>Requests</dt>
                    <dd className="tabular-nums text-ink-3">{k.requestCount.toLocaleString("en-US")}</dd>
                  </div>
                </dl>
                <AlertDialog.Root>
                  <AlertDialog.Trigger asChild>
                    <button type="button" aria-label={`Delete key ${k.name}`} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-danger-50 hover:text-danger">
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ink/40" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 animate-scale-in rounded-[18px] bg-surface p-6 shadow-[var(--shadow-float)]">
                      <AlertDialog.Title className="font-display text-lg font-bold">Delete “{k.name}”?</AlertDialog.Title>
                      <AlertDialog.Description className="mt-1.5 text-sm text-muted">
                        Anything using <span className="font-mono">{k.preview}</span> stops working immediately. This can&apos;t be undone.
                      </AlertDialog.Description>
                      <div className="mt-5 flex justify-end gap-2">
                        <AlertDialog.Cancel asChild>
                          <Button variant="secondary">Cancel</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                          <Button variant="danger" onClick={() => void remove(k.id)}>
                            Delete key
                          </Button>
                        </AlertDialog.Action>
                      </div>
                    </AlertDialog.Content>
                  </AlertDialog.Portal>
                </AlertDialog.Root>
              </li>
            ))}
          </ul>
        )}
        <Link href="/developers/api" className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-blue-700 hover:underline">
          API reference and examples <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
