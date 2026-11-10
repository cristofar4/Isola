import Image from "next/image";
import { CompareSlider } from "@/components/landing/compare-slider";

/** A blue band with diagonal sides, set behind (or inside) a picture. */
function DiagonalBand({ className }: { className: string }) {
  return <div aria-hidden="true" className={`absolute -skew-x-[14deg] bg-gradient-to-br from-blue to-blue-600 ${className}`} />;
}

const sizes = "(min-width: 1024px) 640px, 440px";

/** Sign in: the real before/after of a sneaker, with a divider to drag. */
export function SignInArt() {
  return (
    <div className="relative isolate">
      {/* A blue card set at an angle behind the picture. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 origin-bottom-left rotate-[4deg] translate-x-2 rounded-[24px] bg-gradient-to-br from-blue to-blue-600 shadow-[var(--shadow-blue)] lg:rotate-[5deg] lg:translate-x-4 lg:rounded-[28px]"
      />
      <CompareSlider
        before="/showcase/sneaker-white.webp"
        after="/showcase/sneaker-white-cutout.webp"
        alt="A sneaker photo"
        initial={50}
        objectPosition="50% 55%"
        sizes={sizes}
        priority
        className="aspect-[16/11] w-full rounded-[24px] shadow-[var(--shadow-float)] ring-1 ring-ink/5 lg:aspect-[4/3] lg:rounded-[28px]"
      />
    </div>
  );
}

/** Create account: two real cutouts on a transparent canvas. */
export function SignUpArt() {
  return (
    <div className="relative isolate aspect-[16/11] overflow-hidden rounded-[24px] bg-surface shadow-[var(--shadow-float)] ring-1 ring-ink/5 lg:aspect-[4/3] lg:rounded-[28px]">
      <div aria-hidden="true" className="checkerboard absolute inset-0" />
      <DiagonalBand className="-bottom-[10%] -top-[10%] right-[-8%] w-[50%]" />
      <div className="absolute bottom-[9%] left-[5%] w-[64%] drop-shadow-[0_26px_26px_rgb(32_41_45/0.28)]">
        <Image
          src="/showcase/batch/handbag-cutout.webp"
          alt="A woven leather handbag, cut out from its background"
          width={1000}
          height={730}
          sizes="(min-width: 1024px) 420px, 280px"
          priority
          draggable={false}
          className="h-auto w-full"
        />
      </div>
      <div className="absolute bottom-[9%] right-[13%] h-[66%] drop-shadow-[0_22px_22px_rgb(14_28_80/0.4)]">
        <Image
          src="/showcase/batch/serum-cutout.webp"
          alt="A serum bottle, cut out from its background"
          width={230}
          height={638}
          sizes="(min-width: 1024px) 150px, 100px"
          priority
          draggable={false}
          className="h-full w-auto"
        />
      </div>
      <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-[13px] font-semibold text-ink shadow-sm">
        Transparent PNG
      </span>
    </div>
  );
}
