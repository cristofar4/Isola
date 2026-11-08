import type { Metadata } from "next";
import { BatchStudio } from "@/components/batch/batch-studio";

export const metadata: Metadata = {
  title: "Batch studio",
  description: "Remove backgrounds from a set of images on your device and download them as a ZIP.",
};

export default function BatchPage() {
  return <BatchStudio />;
}
