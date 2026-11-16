import { Navbar } from "@/components/dashboard/navbar";
import { Hero } from "@/components/dashboard/hero";
import { PipelineTimeline } from "@/components/dashboard/pipeline-timeline";
import { AssemblySection } from "@/components/dashboard/assembly-section";
import { Z3Playground } from "@/components/dashboard/z3-playground";
import { ResultsSection } from "@/components/dashboard/results-section";
import { ArchSection } from "@/components/dashboard/arch-section";
import { HonestySection } from "@/components/dashboard/honesty-section";
import { Footer } from "@/components/dashboard/footer";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <PipelineTimeline />
        <AssemblySection />
        <Z3Playground />
        <ResultsSection />
        <ArchSection />
        <HonestySection />
      </main>
      <Footer />
    </div>
  );
}
