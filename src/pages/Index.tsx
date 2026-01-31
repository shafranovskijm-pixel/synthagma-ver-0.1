import { Helmet } from "react-helmet-async";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { Roadmap } from "@/components/landing/Roadmap";
import { CostCalculator } from "@/components/landing/CostCalculator";
import { Testimonials } from "@/components/landing/Testimonials";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";
import { ScrollToTop } from "@/components/ui/ScrollToTop";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>СИНТАГМА — Система дистанционного обучения и документооборота</title>
        <meta name="description" content="Современная СДО для организаций. Создавайте курсы с ИИ, автоматизируйте документооборот, выгружайте в ФРДО. Соответствует 273-ФЗ. От 8 000 ₽/мес." />
        <meta name="keywords" content="СДО, дистанционное обучение, документооборот, ФРДО, 273-ФЗ, онлайн курсы, образовательная платформа, ДПО" />
        <link rel="canonical" href="https://synthagma-bloom.lovable.app/" />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://synthagma-bloom.lovable.app/" />
        <meta property="og:title" content="СИНТАГМА — Система дистанционного обучения" />
        <meta property="og:description" content="Современная СДО для организаций. Создавайте курсы с ИИ, автоматизируйте документооборот, выгружайте в ФРДО." />
        <meta property="og:image" content="https://synthagma-bloom.lovable.app/og-image.png" />
        <meta property="og:locale" content="ru_RU" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="СИНТАГМА — Система дистанционного обучения" />
        <meta name="twitter:description" content="Современная СДО для организаций. Создавайте курсы с ИИ, автоматизируйте документооборот." />
        <meta name="twitter:image" content="https://synthagma-bloom.lovable.app/og-image.png" />
        
        {/* Structured Data */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "СИНТАГМА",
            "applicationCategory": "EducationalApplication",
            "operatingSystem": "Web",
            "description": "Система дистанционного обучения и документооборота для организаций",
            "offers": {
              "@type": "Offer",
              "price": "8000",
              "priceCurrency": "RUB",
              "priceValidUntil": "2026-12-31"
            },
            "aggregateRating": {
              "@type": "AggregateRating",
              "ratingValue": "4.9",
              "reviewCount": "127"
            }
          })}
        </script>
      </Helmet>
      
      <div className="min-h-screen bg-background">
        <Hero />
        <Features />
        <Roadmap />
        <Testimonials />
        <CostCalculator />
        <CTA />
        <Footer />
        <ScrollToTop />
      </div>
    </>
  );
};

export default Index;
