import { cn } from "@/lib/cn";
import { CopyButton } from "./copy-button";

export type CodeLanguage = "ts" | "js" | "json" | "bash" | "http" | "python";

const LABEL: Record<CodeLanguage, string> = { ts: "TypeScript", js: "JavaScript", json: "JSON", bash: "Shell", http: "HTTP", python: "Python" };

const PY_KEYWORDS = new Set("import from as with def return if elif else for in while try except raise True False None and or not print open".split(" "));

const KEYWORDS = new Set(
  "interface type export import from const let var async await return new class implements readonly extends function if else throw private public void null true false undefined of in for while case switch default break try catch finally".split(
    " ",
  ),
);

type Token = { kind: "plain" | "keyword" | "type" | "string" | "comment" | "number" | "fn" | "prop" | "flag" | "method"; text: string };

const COLOR: Record<Token["kind"], string> = {
  plain: "text-[#e6ebef]",
  keyword: "text-[#c4a6ff]",
  type: "text-[#7fd3f7]",
  string: "text-[#a8e3a2]",
  comment: "text-[#8b969b] italic",
  number: "text-[#f6c87a]",
  fn: "text-[#ffb3d1]",
  prop: "text-[#9ec1ff]",
  flag: "text-[#f6c87a]",
  method: "text-[#c4a6ff] font-semibold",
};

/** A small, dependency-free highlighter: enough for the snippets in these docs. */
function tokenize(line: string, language: CodeLanguage): Token[] {
  const lang = language === "js" ? "ts" : language;
  const out: Token[] = [];
  const push = (kind: Token["kind"], text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind === "plain") last.text += text;
    else out.push({ kind, text });
  };
  if (lang === "http") {
    const m = /^(GET|POST|PUT|PATCH|DELETE)(\s+)(\S+)(.*)$/.exec(line);
    if (m) {
      push("method", m[1]);
      push("plain", m[2]);
      push("prop", m[3]);
      push("plain", m[4]);
      return out;
    }
  }
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    let m: RegExpExecArray | null;
    if ((lang === "ts" || lang === "json") && rest.startsWith("//")) {
      push("comment", rest);
      break;
    }
    if ((lang === "bash" || lang === "http" || lang === "python") && /^#/.test(rest) && (i === 0 || /\s/.test(line[i - 1]))) {
      push("comment", rest);
      break;
    }
    if ((m = /^("([^"\\]|\\.)*"?|'([^'\\]|\\.)*'?|`([^`\\]|\\.)*`?)/.exec(rest))) {
      const isKey = lang === "json" && /^\s*:/.test(rest.slice(m[0].length));
      push(isKey ? "prop" : "string", m[0]);
      i += m[0].length;
      continue;
    }
    if (lang === "bash" && (m = /^(--?[\w-]+)/.exec(rest)) && (i === 0 || /\s/.test(line[i - 1]))) {
      push("flag", m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = /^\d[\d_.]*/.exec(rest))) {
      push("number", m[0]);
      i += m[0].length;
      continue;
    }
    if ((m = /^[A-Za-z_$][\w$]*/.exec(rest))) {
      const word = m[0];
      const after = rest.slice(word.length);
      if (lang === "ts" && KEYWORDS.has(word)) push("keyword", word);
      else if (lang === "json" && (word === "true" || word === "false" || word === "null")) push("keyword", word);
      else if (lang === "bash" && i === line.search(/\S/)) push("fn", word);
      else if (lang === "python" && PY_KEYWORDS.has(word)) push("keyword", word);
      else if (lang === "python" && /^\s*\(/.test(after)) push("fn", word);
      else if (lang === "ts" && /^[A-Z]/.test(word)) push("type", word);
      else if (lang === "ts" && /^\s*\??\(/.test(after)) push("fn", word);
      else if (lang === "ts" && /^\??:/.test(after)) push("prop", word);
      else push("plain", word);
      i += word.length;
      continue;
    }
    push("plain", rest[0]);
    i++;
  }
  return out;
}

/** Code sample with a title, language badge, line numbers and a copy button. */
export function CodeBlock({
  code,
  lang = "ts",
  title,
  className,
  lineNumbers = true,
}: {
  code: string;
  lang?: CodeLanguage;
  title?: string;
  className?: string;
  lineNumbers?: boolean;
}) {
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <figure className={cn("not-prose my-5 overflow-hidden rounded-[14px] bg-[#1d2529] shadow-[var(--shadow-card)]", className)}>
      <figcaption className="flex items-center gap-3 border-b border-white/10 bg-[#232c31] px-4 py-2">
        {title && <span className="text-[14px] font-semibold text-white">{title}</span>}
        <span className="rounded-md bg-blue/25 px-2 py-0.5 text-[12px] font-medium text-[#c9d4ff]">{LABEL[lang]}</span>
        <CopyButton text={lines.join("\n")} className="ml-auto" label={title ? "Copy" : "Copy code"} />
      </figcaption>
      <pre className="m-0 overflow-x-auto bg-transparent px-0 py-3 text-[13px] leading-[1.7]" tabIndex={0} aria-label={title ? `${title} code` : "Code sample"}>
        <code className="grid min-w-max font-mono">
          {lines.map((line, n) => (
            <span key={n} className="flex px-4">
              {lineNumbers && (
                <span className="mr-5 inline-block w-6 shrink-0 select-none text-right text-[#939ea3]" aria-hidden="true">
                  {n + 1}
                </span>
              )}
              <span className="whitespace-pre">
                {tokenize(line, lang).map((t, k) => (
                  <span key={k} className={COLOR[t.kind]}>
                    {t.text}
                  </span>
                ))}
                {line === "" && " "}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
