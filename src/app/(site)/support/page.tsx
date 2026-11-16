import type { Metadata } from "next";
import { HelpCentre } from "@/components/help/help-centre";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Answers about uploading, refining cutouts, Batch Studio, accounts, plans, the API and troubleshooting in ISOLA.",
};

export default function SupportPage() {
  return <HelpCentre place="site" />;
}
