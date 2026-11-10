import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/ui/logo";

/**
 * Sign-in, sign-up and the other account pages: a focused screen with only the
 * logo and a way back, so nothing competes with the form.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-x-clip">
      {/* Soft wash and a blue diagonal band behind everything. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_15%_0%,rgb(221_229_253/0.7),transparent_70%),radial-gradient(50%_45%_at_100%_100%,rgb(207_224_246/0.55),transparent_70%)]" />
        <div className="absolute -right-[18%] top-[-10%] h-[70%] w-[46%] rotate-[24deg] rounded-[48px] bg-gradient-to-b from-blue-100/70 to-sky/40 sm:-right-[8%] lg:top-[-18%] lg:h-[85%]" />
      </div>

      <header className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-4 px-4 sm:h-20 sm:px-6 lg:px-8">
        <Link href="/" aria-label="ISOLA home" className="rounded-md">
          <Logo />
        </Link>
        <Link
          href="/"
          className="group inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-[14px] font-semibold text-ink-3 transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
          Back to home
        </Link>
      </header>

      {/* Each page renders its own <main> and footer (see AuthShell). */}
      {children}
    </div>
  );
}
