import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { EditorDemoSection } from "@/components/landing/EditorDemoSection";
import { FrdoSection } from "@/components/landing/FrdoSection";
import { Features } from "@/components/landing/Features";
import { RostechnadzorCourses } from "@/components/landing/RostechnadzorCourses";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { PricingPlans } from "@/components/landing/PricingPlans";
import { BoxedVersionCard } from "@/components/landing/BoxedVersionCard";
import { WebsiteDevelopmentCard } from "@/components/landing/WebsiteDevelopmentCard";
import { Testimonials } from "@/components/landing/Testimonials";
import { MobileApp } from "@/components/landing/MobileApp";
import { FinalCta } from "@/components/landing/FinalCta";
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
        <title>Запустим СДО учебному центру за 7 дней — СИНТАГМА</title>
        <meta name="description" content="Запустим учебному центру СДО с готовыми курсами и базовым комплектом документов за 7 дней. Брендирование, домен, ФИС ФРДО, обучение администратора — под ключ." />
        <meta name="keywords" content="СДО под ключ, запуск СДО, учебный центр, дистанционное обучение, ФРДО, 273-ФЗ, готовые курсы, ДПО" />
        <link rel="canonical" href="https://sintagma.com.ru/" />

        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sintagma.com.ru/" />
        <meta property="og:title" content="Запустим СДО учебному центру за 7 дней — СИНТАГМА" />
        <meta property="og:description" content="Запустим учебному центру СДО с готовыми курсами и базовым комплектом документов за 7 дней." />
        <meta property="og:image" content="https://sintagma.com.ru/og-image.png" />
        <meta property="og:locale" content="ru_RU" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Запустим СДО учебному центру за 7 дней — СИНТАГМА" />
        <meta name="twitter:description" content="Запустим учебному центру СДО с готовыми курсами и базовым комплектом документов за 7 дней." />
        <meta name="twitter:image" content="https://sintagma.com.ru/og-image.png" />

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
        <HowItWorks />
        <EditorDemoSection />
        <RostechnadzorCourses />
        <Features />
        <FrdoSection />
        <MobileApp />
        <PricingPlans />
        <BoxedVersionCard />
        <WebsiteDevelopmentCard />
        <Testimonials />
        <FinalCta />
        <Footer />
        <ScrollToTop />
      </div>
    </>
  );
};

export default Index;
