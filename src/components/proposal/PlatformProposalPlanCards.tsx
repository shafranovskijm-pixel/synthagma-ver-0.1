import { Crown, Check } from "lucide-react";
import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT } from "@/constants/subscriptionPlans";
import { PLAN_ORDER, formatPriceRu } from "@/lib/pricingFeatureRows";

const HIGHLIGHTS: Record<string, string[]> = {
  free: [
    "До 3 курсов и 10 учеников",
    "ИИ-генерация курсов и озвучка",
    "ФИС ФРДО, документы ЛОО, журналы",
    "Видеоидентификация и брендирование",
  ],
  start: [
    "До 15 курсов и 100 учеников",
    "60 завершённых обучений в месяц",
    "Email-рассылки с SMTP, drip и A/B",
    "Безлимитное хранилище файлов",
  ],
  standard: [
    "До 30 курсов и 200 учеников",
    "100 обучений в месяц",
    "Полноценная CRM продаж: КП, договоры, счета",
    "Email-рассылки + продвинутая аналитика",
  ],
  professional: [
    "До 50 курсов и 1 000 учеников",
    "500 обучений в месяц",
    "Вебинары на Kinescope Live",
    "ФИС ФРДО+ — выгружаем за вас",
    "Видеосервис+ (файлы > 2 ГБ)",
  ],
  maximum: [
    "Безлимитные курсы и ученики",
    "3D-тренажёры и интерактивные симуляции",
    "Все функции платформы без ограничений",
    "Персональный менеджер сопровождения",
  ],
};

export function PlatformProposalPlanCards() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {PLAN_ORDER.map((p) => {
        const plan = SUBSCRIPTION_PLANS[p];
        const isRec = p === 'standard';
        const isFree = p === 'free';
        return (
          <div
            key={p}
            className={`relative rounded-3xl border p-6 shadow-sm ${
              isRec ? 'border-accent bg-accent/5' : 'border-border bg-card'
            }`}
          >
            {isRec && (
              <div className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground shadow">
                <Crown className="h-3 w-3" />
                Рекомендуем
              </div>
            )}
            <h3 className="font-display text-xl font-semibold tracking-tight">{plan.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-display text-3xl font-medium">
                {isFree ? '0' : formatPriceRu(plan.price)}
              </span>
              <span className="text-sm text-muted-foreground">{isFree ? '₽' : '₽/мес'}</span>
            </div>
            {!isFree && (
              <div className="mt-1 text-xs text-muted-foreground">
                за год — {formatPriceRu(Math.round(plan.price * (1 - YEARLY_DISCOUNT)))} ₽/мес (−{YEARLY_DISCOUNT * 100}%)
              </div>
            )}
            <ul className="mt-5 space-y-2">
              {HIGHLIGHTS[p].map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="text-foreground/90">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
