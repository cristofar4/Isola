import { Copy, Layers, Wand2 } from "lucide-react";

function TransparencyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h6V3M9 9v6h6V9h6M15 15v6M9 15H3" strokeOpacity="0.45" />
    </svg>
  );
}

const features = [
  { icon: <TransparencyIcon />, label: "Transparent PNG", detail: "Real alpha, full resolution" },
  { icon: <Wand2 className="size-6" strokeWidth={1.6} aria-hidden="true" />, label: "Refine edges", detail: "Feather, shift, restore, erase" },
  { icon: <Layers className="size-6" strokeWidth={1.6} aria-hidden="true" />, label: "Replace backgrounds", detail: "Colour or your own image" },
  { icon: <Copy className="size-6" strokeWidth={1.6} aria-hidden="true" />, label: "Batch exports", detail: "Many images, one ZIP" },
];

export function FeatureStrip() {
  return (
    <section aria-label="Highlights" className="mx-auto max-w-[1240px] px-4 pb-14 sm:px-6 lg:px-8">
      <ul className="grid grid-cols-2 gap-y-6 rounded-[18px] border border-line bg-surface/60 py-5 lg:grid-cols-4 lg:divide-x lg:divide-line">
        {features.map((f) => (
          <li key={f.label} className="flex items-center gap-3 px-5 lg:justify-center">
            <span className="text-ink">{f.icon}</span>
            <span>
              <span className="block text-[15px] font-semibold text-ink">{f.label}</span>
              <span className="block text-xs text-muted">{f.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
