import { Helmet } from "react-helmet-async";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Features as LandingFeatures } from "@/components/landing/Features";
import { PricingPlans } from "@/components/landing/PricingPlans";
import { Footer } from "@/components/landing/Footer";

export default function Features() {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Возможности и тарифы СИНТАГМА</title>
        <meta
          name="description"
          content="Актуальные возможности, тарифы и лимиты СИНТАГМА для учебных центров и образовательных организаций."
        />
        <link rel="canonical" href="https://xn--80aaiswd0ak.xn--p1ai/features" />
        <meta property="og:url" content="https://xn--80aaiswd0ak.xn--p1ai/features" />
      </Helmet>

      <LandingHeader />
      <main className="pt-24">
        <section className="container mx-auto px-4 pb-8 text-center lg:px-6">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            СИНТАГМА
          </p>
          <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
            Возможности и актуальные тарифы
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Состав функций и лимиты собраны из тех же источников, которые используются на главной странице.
            Возможности со статусом Beta требуют отдельной проверки перед рабочим запуском.
          </p>
        </section>

        <LandingFeatures />
        <PricingPlans />
      </main>
      <Footer />
    </div>
  );
}
