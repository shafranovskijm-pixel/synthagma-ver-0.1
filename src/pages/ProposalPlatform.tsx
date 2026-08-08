import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Printer, Share2, Mail, Globe, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ProposalDownloadButton } from "@/components/proposal/ProposalDownloadButton";
import { SignatureStampBlock } from "@/components/proposal/SignatureStampBlock";
import {
  PROPOSAL_CONDITIONS,
  PROPOSAL_CONTACTS,
  PROPOSAL_LAUNCH_PROMISE,
  PROPOSAL_LEGAL_LINKS,
  PROPOSAL_MODULES,
  PROPOSAL_NEXT_STEPS,
  PROPOSAL_WORKFLOW,
  getPublicPlanSummaries,
} from "@/lib/proposal/proposalContent";

export default function ProposalPlatform() {
  const plans = getPublicPlanSummaries();
  const today = new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Коммерческое предложение — СИНТАГМА", url });
      } catch {
        /* отменено пользователем */
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Ссылка скопирована");
  };

  return (
    <>
      <Helmet>
        <title>Коммерческое предложение СИНТАГМА для учебного центра</title>
        <meta
          name="description"
          content="Коммерческое предложение СИНТАГМА: курсы, ученики, документы и журналы, подготовка данных для ФИС ФРДО, актуальные тарифы и условия. Скачайте PDF одним кликом."
        />
        <link rel="canonical" href="https://sintagma.com.ru/proposal/platform" />
        <meta property="og:title" content="Коммерческое предложение СИНТАГМА" />
        <meta
          property="og:description"
          content="Учебный центр целиком в одной системе: обучение, документы, журналы и подготовка данных для ФИС ФРДО."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://sintagma.com.ru/proposal/platform" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <style>{`
        @media print {
          .proposal-print-hide { display: none !important; }
          body { background: #fff !important; }
          [data-proposal-section] { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <main className="min-h-screen bg-background py-10">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6">
          {/* Шапка с действиями */}
          <header className="proposal-print-hide mb-12 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <SigmaLogo size="md" />
              <div className="mt-1 text-xs text-muted-foreground">Образовательная платформа</div>
              <div className="mt-4 text-xs uppercase tracking-widest text-accent">Коммерческое предложение</div>
              <div className="mt-1 text-sm text-muted-foreground">Дата формирования: {today}</div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ProposalDownloadButton />
              <Button variant="outline" onClick={handleShare} className="gap-2" aria-label="Поделиться ссылкой на коммерческое предложение">
                <Share2 className="h-4 w-4" aria-hidden="true" />
                Поделиться
              </Button>
              <Button variant="outline" onClick={() => window.print()} className="gap-2" aria-label="Распечатать коммерческое предложение">
                <Printer className="h-4 w-4" aria-hidden="true" />
                Печать
              </Button>
            </div>
          </header>

          {/* 1. Обложка и обещание результата */}
          <section data-proposal-section className="mb-14 rounded-3xl border border-border bg-card p-8 sm:p-10">
            <h1 className="font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
              Учебный центр целиком в одной системе
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
              Курсы, ученики, документы, журналы и подготовка данных для ФИС ФРДО — без разрозненных
              таблиц и отдельных сервисов. {PROPOSAL_LAUNCH_PROMISE}.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { t: "Один кабинет", d: "обучение и документооборот" },
                { t: "7 дней", d: "до запуска первой группы" },
                { t: "0 ₽", d: "постоянный бесплатный тариф" },
              ].map((c) => (
                <div key={c.t} className="rounded-2xl border border-border bg-secondary/30 p-5">
                  <div className="font-display text-xl font-semibold text-accent">{c.t}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{c.d}</div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
              Результат: прозрачный процесс от программы до выдачи документов, меньше ручной работы
              методиста и администратора, единая база учеников и готовые шаблоны документов.
            </p>
          </section>

          {/* 2. Сценарий работы */}
          <section data-proposal-section className="mb-14">
            <h2 className="font-display text-2xl font-medium tracking-tight">Как это работает</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Курс → группа и ученики → обучение → документы и журналы → подготовка ФИС ФРДО.
            </p>
            <ol className="mt-7 space-y-4">
              {PROPOSAL_WORKFLOW.map((s) => (
                <li key={s.step} className="flex gap-4 rounded-2xl border border-border bg-card p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 font-display text-base font-semibold text-accent">
                    {s.step}
                  </span>
                  <span>
                    <span className="block font-semibold">{s.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-5 rounded-2xl border-l-4 border-accent bg-secondary/30 p-4 text-sm leading-relaxed text-muted-foreground">
              ФИС ФРДО: платформа выполняет проверку и подготовку данных и файла к выгрузке.
              На тарифе «Профессиональный» действует ФРДО+ — выгрузку выполняем за вас.
            </p>
          </section>

          {/* 3. Ключевые модули */}
          <section data-proposal-section className="mb-14">
            <h2 className="font-display text-2xl font-medium tracking-tight">Ключевые модули</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Состав функций зависит от тарифа — доступность указана в каждой карточке.
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {PROPOSAL_MODULES.map((m) => (
                <div key={m.title} className="rounded-2xl border border-border bg-card p-5">
                  <div className="font-semibold">{m.title}</div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
                  {m.plans && <div className="mt-3 text-xs font-semibold text-accent">{m.plans}</div>}
                </div>
              ))}
            </div>
          </section>

          {/* 4. Тарифы и условия */}
          <section data-proposal-section className="mb-14">
            <h2 className="font-display text-2xl font-medium tracking-tight">Тарифы и условия</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Актуальные публичные тарифы. Цены за месяц, при оплате за год — скидка 15%.
            </p>
            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              {plans.map((p) => (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-5 ${p.recommended ? "border-accent bg-accent/5" : "border-border bg-card"}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="font-display text-lg font-semibold">{p.name}</div>
                    <div className="text-right">
                      <div className="font-display text-lg font-medium">{p.priceLabel}</div>
                      {p.yearlyLabel && <div className="text-[11px] text-muted-foreground">{p.yearlyLabel}</div>}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{p.description}</div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div><dt className="inline">Курсы: </dt><dd className="inline text-foreground">{p.courses}</dd></div>
                    <div><dt className="inline">Ученики: </dt><dd className="inline text-foreground">{p.students}</dd></div>
                    <div><dt className="inline">Обучений в месяц: </dt><dd className="inline text-foreground">{p.trainedPerMonth}</dd></div>
                    <div><dt className="inline">Хранилище: </dt><dd className="inline text-foreground">{p.storage}</dd></div>
                  </dl>
                  <ul className="mt-4 space-y-1.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <ul className="mt-6 grid gap-2 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
              {PROPOSAL_CONDITIONS.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 5. Следующий шаг и контакты */}
          <section data-proposal-section className="mb-14 rounded-3xl border border-accent/40 bg-accent/5 p-8 sm:p-10">
            <h2 className="font-display text-2xl font-medium tracking-tight">Следующий шаг</h2>
            <ol className="mt-6 space-y-3">
              {PROPOSAL_NEXT_STEPS.map((s, i) => (
                <li key={s} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span className="pt-1">{s}</span>
                </li>
              ))}
            </ol>
            <div className="proposal-print-hide mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="gap-2">
                <Link to="/register-organization">
                  Зарегистрироваться <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="gap-2">
                <Link to="/demonstration">Записаться на демонстрацию</Link>
              </Button>
            </div>
            <div className="mt-8 grid gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-accent" aria-hidden="true" />
                <span>{PROPOSAL_CONTACTS.site}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-accent" aria-hidden="true" />
                <a href={`mailto:${PROPOSAL_CONTACTS.email}`} className="hover:underline">
                  {PROPOSAL_CONTACTS.email}
                </a>
              </div>
            </div>
            <div className="mt-6 text-xs leading-relaxed text-muted-foreground">
              Юридические документы:{" "}
              {PROPOSAL_LEGAL_LINKS.map((l, i) => (
                <span key={l.href}>
                  {i > 0 && " · "}
                  <Link to={l.href} className="text-accent hover:underline">
                    {l.label}
                  </Link>
                </span>
              ))}
            </div>
          </section>

          <section data-proposal-section className="mb-10 rounded-3xl border border-border bg-card p-6 sm:p-8">
            <h2 className="font-display text-xl font-medium tracking-tight">Реквизиты исполнителя</h2>
            <SignatureStampBlock className="[&>div]:gap-4 sm:[&>div]:gap-6 [&>div>div:last-child]:h-20 [&>div>div:last-child]:w-20 sm:[&>div>div:last-child]:h-28 sm:[&>div>div:last-child]:w-28" />
          </section>
        </div>
      </main>
    </>
  );
}
