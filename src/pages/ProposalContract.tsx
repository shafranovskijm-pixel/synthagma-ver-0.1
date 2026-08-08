import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowRight, Check, FileText } from "lucide-react";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import {
  PLATFORM_CONTRACT_PLANS,
  derivePlatformContractDraft,
  formatRub,
  type PlatformContractPeriodMonths,
} from "@/lib/platform-contract";
import { PlatformContractPreview } from "@/components/platform-contract/PlatformContractPreview";
import { PlatformContractDownloadButton } from "@/components/platform-contract/PlatformContractDownloadButton";

/**
 * Публичная страница проекта договора: выбор тарифа и срока,
 * живой расчёт и предпросмотр первых страниц без авторизации.
 */
export default function ProposalContract() {
  const [plan, setPlan] = useState<SubscriptionPlan>("standard");
  const [periodMonths, setPeriodMonths] = useState<PlatformContractPeriodMonths>(12);

  const draft = useMemo(
    () => derivePlatformContractDraft({ plan, periodMonths }),
    [plan, periodMonths],
  );

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Проект договора СИНТАГМЫ — доступ к платформе</title>
        <meta
          name="description"
          content="Выберите тариф и срок — получите проект договора на доступ к образовательной платформе СИНТАГМА для согласования. PDF в один клик."
        />
        <link rel="canonical" href="https://sintagma.com.ru/proposal/contract" />
      </Helmet>
      <LandingHeader />

      <main className="container mx-auto max-w-5xl px-4 py-10 sm:py-14">
        {/* Hero */}
        <section className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Проект — не подписан
          </div>
          <h1 className="mt-4 font-display text-3xl font-medium tracking-tight sm:text-4xl">
            Проект договора СИНТАГМЫ
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Выберите тариф и срок — получите проект для согласования. Реквизиты вашей организации
            будут заполнены в кабинете.
          </p>
        </section>

        {/* Конструктор */}
        <section className="mt-8 min-w-0 rounded-3xl border border-border bg-card p-5 sm:p-7">
          <h2 className="font-display text-xl font-medium tracking-tight">Тариф и срок</h2>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Выбор тарифа">
            {PLATFORM_CONTRACT_PLANS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setPlan(id)}
                aria-pressed={plan === id}
                className={`min-w-0 rounded-2xl border px-4 py-2 text-sm transition-colors ${
                  plan === id
                    ? "border-accent bg-accent/10 font-semibold text-accent"
                    : "border-border text-muted-foreground hover:border-accent/50"
                }`}
              >
                {SUBSCRIPTION_PLANS[id].name}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Выбор срока оплаты">
            {([1, 12] as PlatformContractPeriodMonths[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPeriodMonths(m)}
                aria-pressed={periodMonths === m}
                className={`min-w-0 rounded-2xl border px-4 py-2 text-sm transition-colors ${
                  periodMonths === m
                    ? "border-accent bg-accent/10 font-semibold text-accent"
                    : "border-border text-muted-foreground hover:border-accent/50"
                }`}
              >
                {m === 1 ? "1 месяц" : "12 месяцев · −15%"}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-[auto,1fr] sm:items-end">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Итого за период
              </div>
              <div className="mt-1 font-display text-3xl font-medium tracking-tight break-words">
                {formatRub(draft.totalAmount)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {draft.monthlyPrice === 0
                  ? "Бесплатный тариф — оплата не требуется"
                  : `${formatRub(draft.effectiveMonthlyPrice)} за месяц${
                      draft.discountRate > 0
                        ? ` · скидка ${Math.round(draft.discountRate * 100)}% — ${formatRub(draft.discountAmount)}`
                        : ""
                    }`}
              </div>
            </div>
            <ul className="grid min-w-0 gap-1.5 sm:grid-cols-2">
              {draft.features.slice(0, 6).map((f) => (
                <li key={f} className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="break-words">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-4">
            {[
              { k: "Курсы", v: draft.limits.courses },
              { k: "Ученики", v: draft.limits.students },
              { k: "Обучений в месяц", v: draft.limits.trainedPerMonth },
              { k: "Хранилище", v: draft.limits.storage },
            ].map((r) => (
              <div key={r.k} className="min-w-0 rounded-2xl border border-border p-3">
                <dt className="text-xs text-muted-foreground">{r.k}</dt>
                <dd className="mt-0.5 text-sm font-semibold break-words">{r.v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex min-w-0 flex-wrap items-center gap-3">
            <PlatformContractDownloadButton draft={draft} size="lg" withPrint />
            <Button asChild size="lg" variant="secondary">
              <Link to="/register-organization">
                Перейти к оформлению
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Link
              to="/login"
              className="text-sm underline underline-offset-4 hover:no-underline"
            >
              У меня уже есть кабинет
            </Link>
          </div>
        </section>

        {/* Предпросмотр */}
        <section className="mt-10 min-w-0">
          <h2 className="font-display text-xl font-medium tracking-tight">
            Как выглядит проект
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Первые страницы проекта. В публичной версии контрагент указан как «Организация-заказчик»,
            реквизиты — подчёркнутые поля для заполнения.
          </p>
          <div className="mt-5 min-w-0 rounded-3xl border border-border bg-muted/40 p-3 sm:p-5">
            <PlatformContractPreview draft={draft} pages={3} />
          </div>
          <div className="mt-5">
            <PlatformContractDownloadButton draft={draft} variant="outline" />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
