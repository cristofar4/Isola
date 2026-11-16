import type { Metadata } from "next";
import { HelpCentre } from "@/components/help/help-centre";
import { StudioGate } from "@/components/studio/studio-gate";

export const metadata: Metadata = {
  title: "Help · Studio",
  description: "Answers about cutouts, Batch Studio, your account, plans and the API.",
  robots: { index: false },
};

/** The help centre inside the studio: its links to your plan and settings stay in the studio. */
export default function StudioHelpPage() {
  return (
    <StudioGate path="/studio/help" label="help">
      <HelpCentre place="studio" />
    </StudioGate>
  );
}
