"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

/** "Was this page helpful?" Sends a yes/no to /api/docs/feedback; nothing else is collected. */
export function DocFeedback({ page }: { page: string }) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "sending"; helpful: boolean } | { kind: "sent"; helpful: boolean } | { kind: "error"; message: string }>({ kind: "idle" });

  async function send(helpful: boolean) {
    setState({ kind: "sending", helpful });
    try {
      const res = await fetch("/api/docs/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ page, helpful }),
      });
      if (res.ok) setState({ kind: "sent", helpful });
      else {
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        setState({ kind: "error", message: json?.message ?? "Couldn't send that. Please try again." });
      }
    } catch {
      setState({ kind: "error", message: "Couldn't reach the server." });
    }
  }

  const chosen = state.kind === "sent" || state.kind === "sending" ? state.helpful : null;
  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-paper-2/70 px-5 py-4 sm:flex-row sm:items-center">
      <p className="text-[15px] font-semibold text-ink" id={`feedback-${page}`}>
        Was this page helpful?
      </p>
      <div className="flex gap-2" role="group" aria-labelledby={`feedback-${page}`}>
        {[
          { helpful: true, label: "Yes, this page was helpful", Icon: ThumbsUp },
          { helpful: false, label: "No, this page wasn't helpful", Icon: ThumbsDown },
        ].map(({ helpful, label, Icon }) => (
          <button
            key={String(helpful)}
            type="button"
            aria-label={label}
            aria-pressed={chosen === helpful}
            disabled={state.kind === "sending" || state.kind === "sent"}
            onClick={() => void send(helpful)}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-[10px] border transition-colors disabled:cursor-default",
              chosen === helpful ? "border-blue bg-blue-50 text-blue-700" : "border-line-strong bg-surface text-blue hover:border-blue/60",
            )}
          >
            <Icon className="size-[18px]" aria-hidden="true" />
          </button>
        ))}
      </div>
      <span className="hidden h-8 w-px bg-line sm:block" aria-hidden="true" />
      <p className={cn("text-[14px]", state.kind === "error" ? "text-danger" : "text-ink-3")} aria-live="polite">
        {state.kind === "sent"
          ? state.helpful
            ? "Thanks, that's recorded."
            : "Thanks. The help centre or Errors & limits may cover what's missing."
          : state.kind === "error"
            ? state.message
            : "Documentation follows implemented features."}
      </p>
    </div>
  );
}
