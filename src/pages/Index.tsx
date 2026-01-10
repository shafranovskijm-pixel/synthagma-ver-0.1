import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { ForStudents } from "@/components/landing/ForStudents";
import { Footer } from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Hero />
      <Features />
      <ForStudents />
      <Footer />
    </div>
  );
};

export default Index;
