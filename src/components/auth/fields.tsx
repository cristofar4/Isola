"use client";

import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

const inputClass =
  "w-full border border-line bg-surface text-ink transition-[border-color,box-shadow] placeholder:text-subtle hover:border-line-strong focus:border-blue focus:outline-none focus:ring-3 focus:ring-blue/15 aria-[invalid=true]:border-danger";
const heights = { md: "h-11 rounded-[10px] px-3 text-[15px]", lg: "h-12 rounded-[12px] px-3.5 text-[16px]" } as const;

type FieldProps = { label: string; hint?: ReactNode; hintTone?: "muted" | "success"; error?: string | null; tall?: boolean };

function Hint({ id, hint, tone }: { id: string; hint: ReactNode; tone: "muted" | "success" }) {
  return (
    <p id={id} className={cn("text-xs", tone === "success" ? "text-success" : "text-muted")}>
      {hint}
    </p>
  );
}

export function TextField({
  label,
  hint,
  hintTone = "muted",
  error,
  tall,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className={cn("font-medium text-ink", tall ? "text-[14px]" : "text-[13px]")}>
        {label}
      </label>
      <input id={id} className={cn(inputClass, heights[tall ? "lg" : "md"])} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {hint && !error && <Hint id={`${id}-hint`} hint={hint} tone={hintTone} />}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function PasswordField(props: InputHTMLAttributes<HTMLInputElement> & FieldProps & { labelAction?: ReactNode }) {
  const { label, hint, hintTone = "muted", error, tall, className, labelAction, onKeyDown, onKeyUp, onBlur, ...rest } = props;
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`, capsLock && `${id}-caps`].filter(Boolean).join(" ") || undefined;
  const readCapsLock = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState?.("CapsLock") ?? false);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className={cn("font-medium text-ink", tall ? "text-[14px]" : "text-[13px]")}>
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          className={cn(inputClass, heights[tall ? "lg" : "md"], "pr-11")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onKeyDown={(e) => {
            readCapsLock(e);
            onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            readCapsLock(e);
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCapsLock(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-ink/5 hover:text-ink"
        >
          {visible ? <EyeOff className="size-[18px]" aria-hidden="true" /> : <Eye className="size-[18px]" aria-hidden="true" />}
        </button>
      </div>
      {capsLock && (
        <p id={`${id}-caps`} className="text-xs font-medium text-warn" aria-live="polite">
          Caps Lock is on.
        </p>
      )}
      {hint && !error && <Hint id={`${id}-hint`} hint={hint} tone={hintTone} />}
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function CheckboxField({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input id={id} type="checkbox" className="size-[18px] shrink-0 cursor-pointer rounded-[5px] accent-blue" {...props} />
      <label htmlFor={id} className="cursor-pointer select-none text-[14px] text-ink-3">
        {label}
      </label>
    </div>
  );
}

export function FormAlert({ children, tone = "danger" }: { children: React.ReactNode; tone?: "danger" | "success" }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-[10px] border px-3 py-2.5 text-[13px] leading-relaxed",
        tone === "danger" ? "border-danger/25 bg-danger-50 text-danger" : "border-success/25 bg-success-50 text-success",
      )}
    >
      {children}
    </div>
  );
}

/** "or" between the email form and other ways in. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[13px] text-muted" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
