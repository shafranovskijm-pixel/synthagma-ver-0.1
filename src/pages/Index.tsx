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
        <meta name="description" content="СИНТАГМА — система дистанционного обучения и документооборота для учебных центров: курсы, ученики, прогресс, документы и подготовка данных для ФИС ФРДО в одном кабинете." />
        <meta name="keywords" content="СДО, СИНТАГМА, учебный центр, дистанционное обучение, ФРДО, готовые курсы, ДПО" />
        <link rel="canonical" href="https://xn--80aaiswd0ak.xn--p1ai/" />

        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://xn--80aaiswd0ak.xn--p1ai/" />
        <meta property="og:description" content="Курсы, ученики, прогресс, документы и подготовка данных для ФИС ФРДО в одном кабинете." />
        <meta property="og:image" content="https://xn--80aaiswd0ak.xn--p1ai/og-registration-organization.jpg" />
        <meta property="og:image:alt" content="Форма регистрации организации в СИНТАГМЕ" />
        <meta property="og:locale" content="ru_RU" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:description" content="Курсы, ученики, прогресс, документы и подготовка данных для ФИС ФРДО в одном кабинете." />
        <meta name="twitter:image" content="https://xn--80aaiswd0ak.xn--p1ai/og-registration-organization.jpg" />


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
              "priceCurrency": "RUB"
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
