"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { useFileDrop } from "@/components/upload/use-file-drop";
import { useUpload } from "@/components/upload/use-upload";
import { cn } from "@/lib/cn";

export function FinalCta() {
  const upload = useUpload();
  const drop = useFileDrop((files) => void upload.handleFiles(files), upload.busy);
  return (
    <section
      aria-labelledby="cta-heading"
      className={cn(
        "mx-auto mb-16 max-w-[1240px] rounded-[22px] px-4 py-14 text-center transition-colors duration-200 sm:px-6 lg:px-8",
        drop.dragging && "bg-blue-50 outline-2 outline-dashed outline-blue",
      )}
      {...drop.bind}
    >
      <input {...upload.inputProps} />
      <h2 id="cta-heading" className="display text-[36px] sm:text-[48px]">
        Your next great image
        <br />
        <span className="text-blue">starts here.</span>
      </h2>
      <Button
        size="lg"
        className="mt-7 min-w-[220px]"
        onClick={upload.openPicker}
        disabled={upload.busy}
        icon={upload.busy ? <Spinner className="size-5" /> : <Upload className="size-[18px]" aria-hidden="true" />}
      >
        {upload.state === "opening" ? "Opening editor…" : "Upload an image"}
      </Button>
      <p className="mt-3 text-sm text-muted">Start with a photo. Keep creative control.</p>
      {upload.issues.length > 0 && (
        <div role="alert" className="mx-auto mt-4 max-w-md rounded-lg border border-danger/25 bg-danger-50 px-3 py-2 text-[13px] text-danger">
          {upload.issues.map((issue) => (
            <p key={issue.name + issue.message}>
              <span className="font-semibold">{issue.name}:</span> {issue.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
