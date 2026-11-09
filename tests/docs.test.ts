import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOC_PAGES, searchDocs } from "@/lib/docs";

function source(href: string) {
  const dir = href === "/developers" ? "" : href.slice("/developers/".length);
  return readFileSync(join(process.cwd(), "src/app/(site)/developers", dir, "page.tsx"), "utf8");
}

describe("developer docs", () => {
  it("every section in the guide has a matching heading on its page", () => {
    for (const page of DOC_PAGES) {
      const text = source(page.href);
      for (const section of page.sections) {
        // "overview" is the page header (DocHeader renders id="overview").
        const found = section.id === "overview" ? text.includes("<DocHeader") : text.includes(`<H2 id="${section.id}"`);
        expect(found, `${page.href}#${section.id}`).toBe(true);
      }
      expect(text.includes(`<DocFooter href="${page.href}"`), `${page.href} footer`).toBe(true);
    }
  });

  it("section ids are unique per page", () => {
    for (const page of DOC_PAGES) {
      const ids = page.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("search ranks title matches first and needs every word", () => {
    expect(searchDocs("webgpu")[0]?.href).toMatch(/browser-requirements|processing/);
    expect(searchDocs("remove-background")[0]?.href).toBe("/developers/server-endpoints#remove-background");
    expect(searchDocs("401").length).toBeGreaterThan(0);
    expect(searchDocs("webgpu zebra")).toEqual([]);
    expect(searchDocs("   ")).toEqual([]);
  });
});
