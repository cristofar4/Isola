import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { PageShell } from "@/components/site/page-shell";

export const metadata: Metadata = {
  title: "Sign in",
  description: "ISOLA accounts aren't available yet. You can use every tool without signing in.",
};

export default function SignInPage() {
  return (
    <PageShell
      eyebrow="Accounts"
      title="Accounts aren't available yet."
      intro={
        <p>
          There&apos;s nothing to sign in to at the moment, and you don&apos;t need an account: the editor and batch studio
          work in your browser without one.
        </p>
      }
    >
      <p>
        Because there are no accounts, ISOLA doesn&apos;t save projects between visits. Export your images before closing
        the tab.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/editor" size="lg">
          Open the editor
        </ButtonLink>
        <ButtonLink href="/batch" size="lg" variant="secondary">
          Batch studio
        </ButtonLink>
      </div>
    </PageShell>
  );
}
