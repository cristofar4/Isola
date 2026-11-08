/**
 * Site-wide marketing configuration. Social links are read from environment
 * variables so each deployment can point to its own profiles; links that are
 * not configured are simply not rendered.
 */

export type SocialNetwork = "github" | "x" | "instagram" | "linkedin" | "youtube";

export interface SocialLink {
  network: SocialNetwork;
  label: string;
  href: string;
}

const socialCandidates: Array<{ network: SocialNetwork; label: string; href: string | undefined }> = [
  {
    network: "github",
    label: "GitHub",
    href: process.env.NEXT_PUBLIC_ISOLA_SOCIAL_GITHUB ?? "https://github.com/cristofar4/isola",
  },
  { network: "x", label: "X", href: process.env.NEXT_PUBLIC_ISOLA_SOCIAL_X },
  { network: "instagram", label: "Instagram", href: process.env.NEXT_PUBLIC_ISOLA_SOCIAL_INSTAGRAM },
  { network: "linkedin", label: "LinkedIn", href: process.env.NEXT_PUBLIC_ISOLA_SOCIAL_LINKEDIN },
  { network: "youtube", label: "YouTube", href: process.env.NEXT_PUBLIC_ISOLA_SOCIAL_YOUTUBE },
];

export const socialLinks: SocialLink[] = socialCandidates.filter(
  (link): link is SocialLink => typeof link.href === "string" && /^https:\/\//.test(link.href),
);

export const site = {
  name: "ISOLA",
  tagline: "Keep the subject. Lose the background.",
  description:
    "ISOLA removes image backgrounds on your device, then gives you the tools to refine edges, replace backgrounds and export at full resolution.",
  supportEmail: process.env.NEXT_PUBLIC_ISOLA_SUPPORT_EMAIL || "",
  legalEntity: process.env.NEXT_PUBLIC_ISOLA_LEGAL_ENTITY || "ISOLA",
};
