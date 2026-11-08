import Link from "next/link";
import { forwardRef, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "dark" | "outline-blue" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-semibold transition-[background-color,color,box-shadow,transform,border-color] duration-200 ease-[var(--ease-out)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-blue text-white shadow-[var(--shadow-blue)] hover:bg-blue-600",
  secondary: "border border-line bg-surface text-ink hover:border-line-strong hover:bg-paper",
  ghost: "text-ink hover:bg-ink/5",
  dark: "bg-ink text-white hover:bg-ink-3",
  "outline-blue": "border border-blue/40 bg-surface text-blue-700 hover:border-blue hover:bg-blue-50",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-50",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {icon}
      {children}
    </button>
  );
});

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({ variant = "primary", size = "md", icon, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}
