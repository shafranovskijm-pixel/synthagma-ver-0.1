import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { CostCalculator } from "@/components/landing/CostCalculator";
import { Testimonials } from "@/components/landing/Testimonials";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <Features />
      <Testimonials />
      <CostCalculator />
      <CTA />
      <Footer />
    </div>
  );
};

export default Index;
