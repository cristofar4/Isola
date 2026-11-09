import { BookOpen, Code2, Copy, Crop, Eraser, Image as ImageIcon, Layers, ShoppingBag, type LucideIcon } from "lucide-react";

/**
 * Everything the Tools menu, the mobile menu and /tools link to. Each entry
 * goes somewhere real: the editor opens with that tool ready, and "Product
 * images" loads Batch Studio's catalogue preset.
 */
export interface ToolLink {
  href: string;
  label: string;
  description: string;
  /** Longer explanation for the /tools page. */
  detail: string;
  icon: LucideIcon;
}

export interface ToolGroup {
  title: string;
  items: ToolLink[];
}

export const EDIT_TOOLS: ToolGroup = {
  title: "Edit an image",
  items: [
    {
      href: "/editor",
      label: "Background remover",
      description: "Isolate your subject",
      detail: "Removes the background on your device and keeps the full resolution of your photo.",
      icon: Layers,
    },
    {
      href: "/editor?tool=restore",
      label: "Restore & erase",
      description: "Refine the edges by hand",
      detail: "Paint back hair and fine detail with the restore brush, or clean up leftovers with erase. Every stroke can be undone.",
      icon: Eraser,
    },
    {
      href: "/editor?panel=background",
      label: "Change background",
      description: "Try a colour or your own image",
      detail: "Keep it transparent, pick a colour, or upload a background image, with an optional soft shadow.",
      icon: ImageIcon,
    },
    {
      href: "/editor?tool=crop",
      label: "Resize & crop",
      description: "Get the right frame",
      detail: "Crop to a ratio such as 1:1 or 4:5, fit the frame to the subject, and choose the exact export size.",
      icon: Crop,
    },
  ],
};

export const MORE_TOOLS: ToolGroup = {
  title: "Work with more",
  items: [
    {
      href: "/batch",
      label: "Batch Studio",
      description: "Process and export multiple images",
      detail: "Remove backgrounds from up to 50 images, apply one look to all of them and download a ZIP. Part of Pro.",
      icon: Copy,
    },
    {
      href: "/batch?preset=catalogue",
      label: "Product images",
      description: "Create a consistent catalogue",
      detail: "Opens Batch Studio with a catalogue preset: white square canvas, even padding, centred products, JPEG.",
      icon: ShoppingBag,
    },
  ],
};

export const LEARN_LINKS: ToolGroup = {
  title: "Learn & build",
  items: [
    {
      href: "/support",
      label: "Help centre",
      description: "Guides for your next edit",
      detail: "How removal works, editing tips, formats and limits, plans and accounts.",
      icon: BookOpen,
    },
    {
      href: "/developers",
      label: "Developer docs",
      description: "Explore processing and integration",
      detail: "The engine adapter, the server routes that exist today and how to self-host the models.",
      icon: Code2,
    },
  ],
};

export const TOOL_GROUPS = [EDIT_TOOLS, MORE_TOOLS, LEARN_LINKS];
