import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { Footer } from "@/components/landing/Footer";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const FeatureEmailCampaigns = () => (
  <div className="min-h-screen bg-background">
    <Helmet>
      <title>Email-рассылки (Beta) — СИНТАГМА</title>
      <meta
        name="description"
        content="Пилотный модуль рассылок СИНТАГМЫ. Отправитель и доставка проверяются отдельно перед использованием."
      />
      <meta name="robots" content="noindex,follow" />
      <link rel="canonical" href="https://xn--80aaiswd0ak.xn--p1ai/feature/email-campaigns" />
    </Helmet>

    <LandingHeader />

    <main className="container mx-auto px-6 py-20 md:py-28">
      <section className="mx-auto max-w-3xl rounded-3xl border border-border bg-card p-8 text-center shadow-sm md:p-12">
        <Badge variant="secondary" className="mb-6 gap-2">
          <FlaskConical className="h-4 w-4" />
          Beta
        </Badge>
        <h1 className="font-display text-4xl font-medium tracking-tight md:text-5xl">
          Email-рассылки
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Это пилотный модуль. Перед использованием мы отдельно настраиваем отправителя,
          выполняем тестовую отправку и подтверждаем, какие действия доступны в конкретной
          организации.
        </p>
        <div className="mt-8 rounded-2xl bg-muted/50 p-5 text-left text-sm leading-relaxed text-muted-foreground">
          Автоматические цепочки, A/B-тесты и расширенная статистика не обещаются до
          отдельной проверки. Основные сценарии обучения СИНТАГМЫ от рассылок не зависят.
        </div>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/demonstration">
            <Button size="lg">Запросить проверку сценария</Button>
          </Link>
          <Link to="/">
            <Button size="lg" variant="outline">Вернуться на главную</Button>
          </Link>
        </div>
      </section>
    </main>

    <Footer />
  </div>
);

export default FeatureEmailCampaigns;
