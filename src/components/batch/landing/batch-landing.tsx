import { ArrowDown, Layers, SlidersHorizontal, Upload } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { formatNaira, planConfig, uploadLimits } from "@/lib/config";
import { SampleProject } from "./sample-project";
import { WorkflowCarousel } from "./workflow-carousel";

const SIGN_UP = "/sign-up?next=%2Fbatch";
const SIGN_IN = "/sign-in?next=%2Fbatch";
const SIGN_IN_CATALOGUE = "/sign-in?next=%2Fbatch%3Fpreset%3Dcatalogue";

const features = [
  { icon: Upload, title: "Upload together", text: `Add up to ${uploadLimits.maxBatchFiles} images at once.` },
  { icon: SlidersHorizontal, title: "Create a consistent look", text: "Remove backgrounds and match your style across the set." },
  { icon: Layers, title: "Export in one ZIP", text: "Get all your processed images together, ready to use." },
];

/** Batch Studio for signed-out visitors: what it does, a walkthrough, and a sample project to try. */
export function BatchLanding({ preset = null }: { preset?: "catalogue" | null }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6 lg:px-8">
      <header className="pb-10 pt-14 text-center sm:pt-16">
        <h1 className="display mx-auto max-w-4xl text-balance text-[44px] sm:text-[62px]">
          Your entire collection.
          <span className="block text-blue">One effortless workflow.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[18px] text-ink-3">Remove backgrounds, match your images and export together.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <ButtonLink href={SIGN_UP} size="lg" className="min-w-[190px]">
            Create account
          </ButtonLink>
          <ButtonLink href="#how-it-works" size="lg" variant="outline" className="min-w-[190px]">
            Explore the workflow <ArrowDown className="size-4" aria-hidden="true" />
          </ButtonLink>
        </div>
        <p className="mt-4 text-[13px] text-muted">
          Batch Studio is part of Pro ({formatNaira(planConfig.proPriceNgn)}/month or {formatNaira(planConfig.proYearlyPriceNgn)}/year). A free
          account lets you remove backgrounds one image at a time in the editor.
        </p>
      </header>

      <WorkflowCarousel />

      <div className="mt-14">
        {preset === "catalogue" && (
          <div role="status" className="mb-5 flex flex-col gap-3 rounded-[14px] border border-blue-100 bg-blue-50 px-4 py-3 text-[14px] text-ink-3 sm:flex-row sm:items-center">
            <p className="flex-1">
              <span className="font-semibold text-ink">Catalogue preset:</span> white background, square canvas and 10% padding,
              shown on the samples below. Sign in to use it on your own product photos.
            </p>
            <ButtonLink href={SIGN_IN_CATALOGUE} size="sm">
              Sign in with this preset
            </ButtonLink>
          </div>
        )}
        <SampleProject preset={preset} />
      </div>

      <ul className="mt-12 grid gap-6 border-y border-line py-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-line">
        {features.map((f) => (
          <li key={f.title} className="flex items-start gap-4 md:px-6 first:md:pl-0">
            <f.icon className="mt-0.5 size-8 shrink-0 text-ink" strokeWidth={1.5} aria-hidden="true" />
            <span>
              <span className="block text-[17px] font-semibold text-ink">{f.title}</span>
              <span className="block text-[14px] text-ink-3">{f.text}</span>
            </span>
          </li>
        ))}
      </ul>

      <section aria-labelledby="batch-cta" className="mt-10 flex flex-col gap-5 rounded-[20px] bg-[linear-gradient(135deg,#e4ebfd,#dde6fb)] px-6 py-8 sm:flex-row sm:items-center sm:px-8">
        <h2 id="batch-cta" className="display flex-1 text-[30px] sm:text-[36px]">
          Your next batch starts here.
        </h2>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={SIGN_UP} size="lg" className="min-w-[170px]">
            Create account
          </ButtonLink>
          <ButtonLink href={SIGN_IN} size="lg" variant="outline" className="min-w-[130px]">
            Sign in
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
