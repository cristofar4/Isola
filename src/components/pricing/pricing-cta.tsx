"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/progress";
import { TrialNote } from "@/components/upload/trial-note";
import { useUpload } from "@/components/upload/use-upload";

export function PricingCta() {
  const upload = useUpload({ requireAccount: true });
  return (
    <section aria-labelledby="pricing-cta" className="rounded-[22px] bg-[linear-gradient(135deg,#e7eefd,#dde7fb)] px-6 py-12 text-center">
      <input {...upload.inputProps} />
      <h2 id="pricing-cta" className="display text-[32px] sm:text-[40px]">
        Start with your next image.
      </h2>
      <Button
        size="lg"
        className="mt-6 min-w-[220px]"
        onClick={upload.openPicker}
        disabled={upload.busy}
        icon={upload.busy ? <Spinner className="size-5" /> : <Upload className="size-[18px]" aria-hidden="true" />}
      >
        {upload.mustSignIn && upload.guestTries ? "Continue with a free account" : "Upload an image"}
      </Button>
      <TrialNote tries={upload.guestTries} signedIn={upload.signedIn} className="mt-3" />
      {upload.issues.length > 0 && (
        <p role="alert" className="mt-3 text-[13px] text-danger">
          {upload.issues[0].name}: {upload.issues[0].message}
        </p>
      )}
    </section>
  );
}
