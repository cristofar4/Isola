import { CompareSlider } from "./compare-slider";
import { UploadPanel } from "./upload-panel";

export function Hero() {
  return (
    <section className="mx-auto max-w-[1240px] px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:px-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="animate-fade-up">
          <h1 className="display text-balance text-[44px] sm:text-[64px] lg:text-[76px]">
            Keep the subject.
            <br />
            <span className="text-blue">Lose the background.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-3 sm:text-lg">
            From everyday photos to polished product images. Make room for what matters.
          </p>
        </div>
        <p className="eyebrow hidden border-l-2 border-line-strong py-1 pl-4 text-ink-3 lg:mb-24 lg:block">
          Your images. Reimagined.
        </p>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1.62fr)_minmax(320px,1fr)] lg:gap-6">
        <div className="animate-fade-up [animation-delay:120ms]">
          <CompareSlider
            before="/showcase/portrait-curly.webp"
            after="/showcase/portrait-curly-cutout.webp"
            alt="Smiling woman with short curly hair in a striped blazer"
            objectPosition="50% 21%"
            className="aspect-[4/3] sm:aspect-[16/10]"
            priority
            caption={
              <p className="rounded-lg bg-white/85 px-3 py-2 text-[13px] font-semibold leading-snug text-ink backdrop-blur-sm">
                Fine details.
                <br />
                Beautifully preserved.
              </p>
            }
          />
          <p className="mt-2 text-xs text-muted">
            Example output from ISOLA&apos;s Standard on-device model. Drag the divider or use the arrow keys.
          </p>
        </div>
        <UploadPanel className="animate-fade-up [animation-delay:200ms]" />
      </div>
    </section>
  );
}
