import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { VideoDemos } from "@/components/landing/video-demos";
import { FAQ } from "@/components/landing/faq";
import { Footer } from "@/components/landing/footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-900">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <VideoDemos />
      <FAQ />
      <Footer />
    </main>
  );
}