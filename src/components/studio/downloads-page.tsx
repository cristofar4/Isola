"use client";

import { Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { clearExports, deleteExport, getExport, MAX_RECORDS, type ExportRecord } from "@/lib/studio/export-history";
import { bytesText, useBlobUrls, useExportHistory, whenText } from "./use-studio-data";

const SOURCE: Record<ExportRecord["source"], string> = { batch: "Batch Studio", editor: "Editor", "export-set": "Export set", library: "Asset library", project: "Project" };

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Everything downloaded recently, kept in this browser so it can be taken again. */
export function DownloadsPage() {
  const records = useExportHistory();
  const thumbs = useBlobUrls((records ?? []).map((r) => r.thumb));
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[40px]">Downloads</h1>
          <p className="mt-2 text-[16px] text-ink-3">Your last {MAX_RECORDS} downloads from anywhere in ISOLA, kept in this browser so you can take them again.</p>
        </div>
        {records && records.length > 0 && (
          <Button variant="secondary" icon={<Trash2 className="size-4" aria-hidden="true" />} onClick={() => void clearExports().then(() => setMessage("Cleared your download history."))}>
            Clear history
          </Button>
        )}
      </header>
      {message && (
        <p role="status" className="mt-4 text-[13px] font-medium text-success">
          {message}
        </p>
      )}
      {!records ? (
        <p className="mt-10 flex items-center justify-center gap-2 text-muted">
          <Spinner /> Loading…
        </p>
      ) : records.length === 0 ? (
        <div className="mt-6 rounded-[18px] border-2 border-dashed border-line-strong px-6 py-14 text-center">
          <p className="text-[16px] font-semibold text-ink">No downloads yet</p>
          <p className="mt-1 text-[14px] text-muted">Downloads from the editor, Batch Studio, projects and the asset library appear here.</p>
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-[16px] border border-line bg-surface" aria-label="Downloads">
          {records.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-download={r.fileName}>
              <span className="checkerboard-sm relative size-12 shrink-0 overflow-hidden rounded-[8px] border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
                {thumbs[i] && <img src={thumbs[i]!} alt="" className="absolute inset-0 size-full object-cover" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-ink">{r.fileName}</p>
                <p className="truncate text-[12px] text-muted">
                  {SOURCE[r.source]} · {r.files} file{r.files === 1 ? "" : "s"} · {r.format} · {bytesText(r.bytes)} · {whenText(r.createdAt)}
                </p>
              </div>
              {r.blob ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download className="size-4" aria-hidden="true" />}
                  aria-label={`Download ${r.fileName} again`}
                  onClick={async () => {
                    const full = await getExport(r.id);
                    if (full?.blob) download(full.blob, full.fileName);
                    else setMessage("That file is no longer stored in this browser.");
                  }}
                >
                  Download again
                </Button>
              ) : (
                <span className="text-[12px] text-muted">Details only</span>
              )}
              <button type="button" aria-label={`Remove ${r.fileName} from history`} onClick={() => void deleteExport(r.id)} className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-danger-50 hover:text-danger">
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
