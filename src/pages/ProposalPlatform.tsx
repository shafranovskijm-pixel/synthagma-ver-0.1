import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Phone, Mail, Globe, ShieldCheck, Gift, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { PlatformProposalHeader } from "@/components/proposal/PlatformProposalHeader";
import { PlatformProposalAdvantages } from "@/components/proposal/PlatformProposalAdvantages";
import { PlatformProposalPricingTable } from "@/components/proposal/PlatformProposalPricingTable";
import { PlatformProposalPlanCards } from "@/components/proposal/PlatformProposalPlanCards";
import { exportPlatformProposalPdf } from "@/utils/exportPlatformProposalPdf";

const KPI = [
  { label: "300+", caption: "готовых программ" },
  { label: "1 мин", caption: "на подготовку файла ФРДО" },
  { label: "5", caption: "тарифов от 0 ₽" },
  { label: "5 мин", caption: "до запуска" },
  { label: "24/7", caption: "доступ и поддержка" },
];

const ADDITIONAL_SERVICES = [
  { title: "ФРДО+", desc: "Выгружаем данные в ФИС ФРДО за вас. Включено в Профессиональный и Максимальный тарифы." },
  { title: "Персональный менеджер", desc: "Сопровождение запуска и помощь по любым вопросам в рабочее время." },
  { title: "Разработка курсов «под ключ»", desc: "Методисты и дизайнеры создают курс по вашей программе с нуля." },
  { title: "Выезд для запуска", desc: "Очное обучение команды и настройка платформы под ваши процессы." },
];

const GUARANTEES = [
  { icon: ShieldCheck, title: "Хостинг РФ", desc: "Серверы и резервные копии на территории Российской Федерации." },
  { icon: BadgeCheck, title: "152-ФЗ, 273-ФЗ", desc: "Обработка персональных данных и образовательная деятельность." },
  { icon: BadgeCheck, title: "63-ФЗ (ПЭП)", desc: "Простая электронная подпись для договоров и протоколов." },
  { icon: BadgeCheck, title: "54-ФЗ", desc: "Фискализация платежей через интегрированный платёжный шлюз." },
];

export default function ProposalPlatform() {
  const [exporting, setExporting] = useState(false);

  const handleDownload = async () => {
    setExporting(true);
    try {
      await exportPlatformProposalPdf();
      toast.success("PDF готов");
    } catch (e) {
      console.error(e);
      toast.error("Не удалось сгенерировать PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Коммерческое предложение — Синтагма</title>
        <meta
          name="description"
          content="Готовое коммерческое предложение по образовательной платформе Синтагма: 300+ программ, ФИС ФРДО, ИИ-генерация курсов, CRM, вебинары. 5 тарифов от 0 ₽."
        />
        <link rel="canonical" href="https://sintagma.com.ru/proposal/platform" />
        <meta property="og:title" content="Коммерческое предложение — Синтагма" />
        <meta
          property="og:description"
          content="LMS под ключ для лицензированных образовательных организаций: ИИ, ФРДО, CRM, вебинары, документы."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sintagma.com.ru/proposal/platform" />
      </Helmet>

      <style>{`
        @media print {
          .proposal-print-hide { display: none !important; }
          body { background: #fff !important; }
          [data-proposal-section] { break-inside: avoid; page-break-inside: avoid; }
          [data-proposal-section] + [data-proposal-section] { page-break-before: always; }
        }
      `}</style>

      <main className="min-h-screen bg-gradient-to-b from-background via-secondary/10 to-background py-10">
        <div id="platform-proposal-root" className="container mx-auto max-w-5xl px-4 sm:px-6">
          <PlatformProposalHeader onDownload={handleDownload} isExporting={exporting} />

          {/* Section 1: Hero */}
          <section data-proposal-section className="mb-10 rounded-3xl border border-border bg-card p-8 shadow-sm sm:p-10">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              Полноценная LMS под ключ
            </div>
            <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">
              Образовательная платформа Синтагма
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
              От конструктора курсов до автоматической выгрузки в ФИС ФРДО — всё, что нужно лицензированной
              образовательной организации, в одной системе. Запускайтесь за 5 минут, масштабируйтесь без
              ограничений.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {KPI.map((k) => (
                <div key={k.label} className="rounded-2xl border border-border bg-background p-4 text-center">
                  <div className="font-display text-2xl font-semibold text-accent">{k.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{k.caption}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-muted-foreground">
              <strong className="text-foreground">Исполнитель:</strong> ИП Шафрановский М. М. ·
              sintagma.com.ru · Договор-оферта на платформе.
            </div>
          </section>

          {/* Section 2: Advantages */}
          <section data-proposal-section className="mb-10">
            <h2 className="mb-2 font-display text-2xl font-medium tracking-tight">Ключевые преимущества</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              10 направлений, которые делают Синтагму полноценной заменой нескольких сервисов сразу.
            </p>
            <PlatformProposalAdvantages />
          </section>

          {/* Section 3: Pricing table */}
          <section data-proposal-section className="mb-10">
            <h2 className="mb-2 font-display text-2xl font-medium tracking-tight">Сравнение тарифов</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Полный список возможностей по 5 тарифам. При оплате за год — скидка 15%.
            </p>
            <PlatformProposalPricingTable />
          </section>

          {/* Section 4: Plan cards */}
          <section data-proposal-section className="mb-10">
            <h2 className="mb-2 font-display text-2xl font-medium tracking-tight">Что входит в каждый тариф</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Краткое содержание планов. Тариф «Стандарт» рекомендуем для большинства организаций.
            </p>
            <PlatformProposalPlanCards />
          </section>

          {/* Section 5: Discounts & conditions */}
          <section data-proposal-section className="mb-10 rounded-3xl border border-border bg-card p-8 shadow-sm">
            <div className="mb-4 inline-flex items-center gap-2 text-accent">
              <Gift className="h-5 w-5" />
              <h2 className="font-display text-2xl font-medium tracking-tight">Скидки и условия</h2>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { t: "Оплата за год — −15%", d: "К любому платному тарифу. Экономия от 8 000 ₽ в год." },
                { t: "Безлимитное хранилище", d: "Видео, PDF, изображения — без ограничений по объёму на всех тарифах." },
                { t: "Бесплатная миграция курсов", d: "Перенесём ваши материалы и зарегистрируем учеников." },
                { t: "Помощь с брендированием", d: "Настройка логотипа, домена и цветовой схемы — включено." },
              ].map((item) => (
                <li key={item.t} className="rounded-2xl border border-border bg-background p-4">
                  <div className="font-display text-base font-semibold">{item.t}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{item.d}</div>
                </li>
              ))}
            </ul>
          </section>

          {/* Section 6: Additional services */}
          <section data-proposal-section className="mb-10">
            <h2 className="mb-2 font-display text-2xl font-medium tracking-tight">Дополнительные услуги</h2>
            <p className="mb-6 text-sm text-muted-foreground">Подключаются опционально к любому тарифу.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {ADDITIONAL_SERVICES.map((s) => (
                <div key={s.title} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="font-display text-base font-semibold">{s.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{s.desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 7: Guarantees */}
          <section data-proposal-section className="mb-10">
            <h2 className="mb-2 font-display text-2xl font-medium tracking-tight">Гарантии и юридическая база</h2>
            <p className="mb-6 text-sm text-muted-foreground">Соответствие требованиям 152-ФЗ, 273-ФЗ, 63-ФЗ, 54-ФЗ.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {GUARANTEES.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-display text-base font-semibold">{title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              Подробные документы:{" "}
              <Link to="/public-offer" className="text-accent hover:underline">публичная оферта</Link>,{" "}
              <Link to="/privacy" className="text-accent hover:underline">политика конфиденциальности</Link>,{" "}
              <Link to="/personal-data" className="text-accent hover:underline">обработка ПД</Link>.
            </div>
          </section>

          {/* Section 8: Contacts & CTA */}
          <section
            data-proposal-section
            className="mb-10 rounded-3xl border border-accent/40 bg-gradient-to-br from-accent/10 via-card to-card p-8 shadow-sm sm:p-10"
          >
            <h2 className="font-display text-2xl font-medium tracking-tight sm:text-3xl">
              Готовы начать?
            </h2>
            <p className="mt-3 max-w-2xl text-base text-muted-foreground">
              Зарегистрируйтесь бесплатно и протестируйте платформу — без карты и без обязательств.
              Бесплатный тариф работает навсегда.
            </p>
            <div className="proposal-print-hide mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/register-organization">
                  Зарегистрироваться <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="gap-2">
                <a href="mailto:info@sintagma.com.ru?subject=Обсуждение%20тарифов%20Синтагма">
                  <Mail className="h-4 w-4" /> Обсудить с менеджером
                </a>
              </Button>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-accent" />
                <span>sintagma.com.ru</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-accent" />
                <a href="mailto:info@sintagma.com.ru" className="hover:underline">info@sintagma.com.ru</a>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-accent" />
                <span>По запросу через email</span>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
