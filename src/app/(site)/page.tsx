import { Details } from "@/components/landing/details";
import { FeatureStrip } from "@/components/landing/feature-strip";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { Possibilities } from "@/components/landing/possibilities";
import { WorkflowCards } from "@/components/landing/workflow-cards";

export default function Home() {
  return (
    <>
      <Hero />
      <FeatureStrip />
      <Possibilities />
      <Details />
      <WorkflowCards />
      <FinalCta />
    </>
  );
}
