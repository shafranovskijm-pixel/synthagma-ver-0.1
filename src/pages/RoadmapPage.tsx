import { Helmet } from "react-helmet-async";
import { Roadmap } from "@/components/landing/Roadmap";
import { Footer } from "@/components/landing/Footer";
import { ScrollToTop } from "@/components/ui/ScrollToTop";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const RoadmapPage = () => {
  return (
    <>
      <Helmet>
        <title>Дорожная карта — СИНТАГМА</title>
        <meta name="description" content="План развития платформы СИНТАГМА. Авторизация через Госуслуги, ЭЦП, мобильное приложение, API интеграции и многое другое." />
      </Helmet>
      
      <div className="min-h-screen bg-background">
        {/* Back navigation */}
        <div className="container mx-auto px-6 pt-8">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            На главную
          </Link>
        </div>
        
        <Roadmap />
        <Footer />
        <ScrollToTop />
      </div>
    </>
  );
};

export default RoadmapPage;
