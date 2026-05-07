import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { EditorAndFrdoSections } from "@/components/landing/EditorAndFrdoSections";
import { RostechnadzorCourses } from "@/components/landing/RostechnadzorCourses";
import { LandingHeader } from "@/components/landing/LandingHeader";

import { PricingPlans } from "@/components/landing/PricingPlans";
import { BoxedVersionCard } from "@/components/landing/BoxedVersionCard";
import { WebsiteDevelopmentCard } from "@/components/landing/WebsiteDevelopmentCard";
import { Testimonials } from "@/components/landing/Testimonials";

import { MobileApp } from "@/components/landing/MobileApp";
import { Footer } from "@/components/landing/Footer";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user, userRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user && userRole) {
      if (userRole === 'admin') navigate('/admin', { replace: true });
      else if (userRole === 'organization') navigate('/organization', { replace: true });
      else if (userRole === 'company') navigate('/company', { replace: true });
      else navigate('/student', { replace: true });
    }
  }, [user, userRole, loading, navigate]);

  return (
    <>
      <Helmet>
        <title>СИНТАГМА — СДО и документооборот для организаций</title>
        <meta name="description" content="Современная СДО для организаций. Создавайте курсы с ИИ, автоматизируйте документооборот, выгружайте в ФРДО. Соответствует 273-ФЗ. От 0 ₽." />
        <meta name="keywords" content="СДО, дистанционное обучение, документооборот, ФРДО, 273-ФЗ, онлайн курсы, образовательная платформа, ДПО" />
        <link rel="canonical" href="https://sintagma.com.ru/" />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sintagma.com.ru/" />
        <meta property="og:title" content="СИНТАГМА — СДО и документооборот для организаций" />
        <meta property="og:description" content="Современная СДО для организаций. Создавайте курсы с ИИ, автоматизируйте документооборот, выгружайте в ФРДО." />
        <meta property="og:image" content="https://sintagma.com.ru/og-image.png" />
        <meta property="og:locale" content="ru_RU" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="СИНТАГМА — СДО и документооборот для организаций" />
        <meta name="twitter:description" content="Современная СДО для организаций. Создавайте курсы с ИИ, автоматизируйте документооборот." />
        <meta name="twitter:image" content="https://sintagma.com.ru/og-image.png" />
        
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
              "price": "0",
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
        <LandingHeader showStars={false} />
        <Hero showStars={false} />
        <EditorAndFrdoSections />
        <PricingPlans />
        <BoxedVersionCard />
        <WebsiteDevelopmentCard />
        <Features />
        <RostechnadzorCourses />
        
        <Testimonials />
        <MobileApp />
        <Footer />
        <ScrollToTop />
      </div>
    </>
  );
};

export default Index;
