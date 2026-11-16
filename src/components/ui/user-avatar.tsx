"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/initials";

/** Photos an account may show: one uploaded in Settings (a small data URL) or one from Google or GitHub sign-in. */
export function usableAvatar(image: string | null | undefined): string | null {
  if (!image) return null;
  return /^https:\/\//.test(image) || /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(image) ? image : null;
}

/**
 * A person's profile picture: their photo when the account has one, otherwise
 * their initials on the brand gradient. A photo that fails to load falls back
 * to the initials.
 */
export function UserAvatar({ name, email, image, className }: { name: string; email: string; image?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const usable = usableAvatar(image);
  const src = usable && usable !== failed ? usable : null;
  return (
    <span
      aria-hidden="true"
      data-avatar={src ? "photo" : "initials"}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue to-blue-700 font-display font-bold text-white",
        className,
      )}
    >
      {src ? (
        // A tiny avatar from the account (or the sign-in provider): next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          // Pages are cross-origin isolated, so a provider's photo must be fetched with CORS.
          crossOrigin={src.startsWith("https:") ? "anonymous" : undefined}
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
          className="size-full object-cover"
        />
      ) : name || email ? (
        initialsOf(name, email)
      ) : null}
    </span>
  );
}
