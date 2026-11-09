"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { LogOut, UserRound, Wand2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { signInHref } from "@/lib/session-gate";

/** Signing in from a workspace page brings you back to it (the batch itself is kept in the browser). */
function useSignInHref() {
  const pathname = usePathname();
  return pathname === "/batch" || pathname === "/editor" ? signInHref(pathname) : "/sign-in";
}

function initials(name: string, email: string) {
  const source = name.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Avatar({ name, email, size = "md" }: { name: string; email: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-blue font-semibold text-white ${size === "md" ? "size-9 text-[13px]" : "size-7 text-[11px]"}`}
    >
      {initials(name, email)}
    </span>
  );
}

/** Desktop header actions: sign-in links when signed out, account menu when signed in. */
export function UserMenu() {
  const router = useRouter();
  const signIn = useSignInHref();
  const onBatch = usePathname() === "/batch";
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <span className="inline-block h-9 w-[180px]" aria-hidden="true" />;

  if (!session) {
    return (
      <>
        <Link href={signIn} className="inline-flex h-10 items-center rounded-[10px] border border-line-strong px-4 text-sm font-semibold text-ink hover:border-ink hover:bg-ink/5">
          Sign in
        </Link>
        {onBatch ? (
          <ButtonLink href="/sign-up?next=%2Fbatch" size="md">
            Create account
          </ButtonLink>
        ) : (
          <ButtonLink href="/editor" size="md">
            Get started
          </ButtonLink>
        )}
      </>
    );
  }

  const { name, email } = session.user;
  return (
    <>
      <ButtonLink href="/editor" size="md" variant="secondary">
        Open editor
      </ButtonLink>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger
          className="rounded-full outline-offset-2 transition-shadow hover:shadow-[0_0_0_3px_var(--color-blue-100)] data-[state=open]:shadow-[0_0_0_3px_var(--color-blue-100)]"
          aria-label={`Account menu for ${name || email}`}
        >
          <Avatar name={name} email={email} />
        </DropdownMenu.Trigger>
                  <DropdownMenu.Content
            align="end"
            sideOffset={8}
            className="z-50 w-[240px] animate-scale-in rounded-[14px] border border-line bg-surface p-1.5 text-sm shadow-[var(--shadow-float)]"
          >
            <div className="px-2.5 pb-2 pt-1.5">
              <p className="truncate font-semibold text-ink">{name || "Your account"}</p>
              <p className="truncate text-xs text-muted">{email}</p>
            </div>
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item asChild>
              <Link href="/account" className="flex items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-paper">
                <UserRound className="size-4 text-muted" aria-hidden="true" /> Account
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Item asChild>
              <Link href="/editor" className="flex items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-paper">
                <Wand2 className="size-4 text-muted" aria-hidden="true" /> Editor
              </Link>
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-line" />
            <DropdownMenu.Item
              onSelect={async () => {
                await authClient.signOut();
                router.push("/");
                router.refresh();
              }}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-paper"
            >
              <LogOut className="size-4 text-muted" aria-hidden="true" /> Sign out
            </DropdownMenu.Item>
          </DropdownMenu.Content>
              </DropdownMenu.Root>
    </>
  );
}

/** Account links inside the mobile menu sheet. */
export function MobileUserLinks({ onNavigate }: { onNavigate: () => void }) {
  const router = useRouter();
  const signIn = useSignInHref();
  const { data: session, isPending } = authClient.useSession();
  if (isPending) return null;
  if (!session) {
    return (
      <>
        <Link href={signIn} className="rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-paper">
          Sign in
        </Link>
        <Link href="/sign-up" className="rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-paper">
          Create account
        </Link>
      </>
    );
  }
  return (
    <>
      <div className="flex items-center gap-3 px-3 py-2">
        <Avatar name={session.user.name} email={session.user.email} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{session.user.name}</p>
          <p className="truncate text-xs text-muted">{session.user.email}</p>
        </div>
      </div>
      <Link href="/account" className="rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-paper">
        Account
      </Link>
      <button
        type="button"
        className="rounded-lg px-3 py-2.5 text-left text-[15px] font-medium hover:bg-paper"
        onClick={async () => {
          onNavigate();
          await authClient.signOut();
          router.push("/");
          router.refresh();
        }}
      >
        Sign out
      </button>
    </>
  );
}
