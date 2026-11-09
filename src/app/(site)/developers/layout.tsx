import type { ReactNode } from "react";
import { DocsSidebar, MobileDocsNav, OnThisPage } from "@/components/docs/docs-nav";

/** Three-column developer guide: pages and search, content, and this page's sections. */
export default function DevelopersLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1480px]">
      <aside aria-label="Developer guide navigation" className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[272px] shrink-0 overflow-y-auto border-r border-line bg-paper lg:block">
        <DocsSidebar />
      </aside>
      <div className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-8 lg:px-10 lg:pt-8">
        <MobileDocsNav />
        <article data-doc-content>{children}</article>
      </div>
      <aside aria-label="Page sections" className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-[280px] shrink-0 overflow-y-auto border-l border-line xl:block">
        <OnThisPage />
      </aside>
    </div>
  );
}
