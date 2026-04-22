import { useEffect, useMemo, useState } from "react";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { supabase } from "@/integrations/supabase/client";
import { Check, Circle, X, Sparkles, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY_PREFIX = "org-quickstart-dismissed-";

interface Step {
  id: string;
  title: string;
  description: string;
  done: boolean;
  action: () => void;
  cta: string;
}

/**
 * Карточка-чек-лист первых шагов для новой организации.
 * Показывается на вкладке «Курсы», пока:
 *  - не выполнены все шаги, ИЛИ
 *  - пользователь не закрыл её вручную.
 * Прогресс определяется автоматически (есть ли курсы, ученики, логотип и т.д.).
 */
export function QuickStartCard() {
  const d = useOrgDashboard();
  const orgId = d.organizationId;
  const dismissKey = orgId ? `${DISMISS_KEY_PREFIX}${orgId}` : null;

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (!dismissKey) return false;
    try { return localStorage.getItem(dismissKey) === "1"; } catch { return false; }
  });

  const [hasLink, setHasLink] = useState<boolean | null>(null);
  const [hasStudent, setHasStudent] = useState<boolean | null>(null);

  // Detect: registration link created? at least one student?
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      const sb: any = supabase;
      const linkRes = await sb.from("registration_links").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
      const studentRes = await sb.from("enrollments").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
      if (cancelled) return;
      setHasLink((linkRes.count ?? 0) > 0);
      setHasStudent((studentRes.count ?? 0) > 0);
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  const hasCourse = (d.courses?.length ?? 0) > 0;
  const hasLogo = !!d.branding.brandingSettings.logoUrl;
  const planName = d.subscriptionLimits?.plan;
  const hasPaidPlan = planName && planName !== "free";

  const steps: Step[] = useMemo(() => [
    {
      id: "course",
      title: "Создайте первый курс",
      description: "Загрузите свою программу или возьмите готовую из каталога.",
      done: hasCourse,
      cta: "Создать курс",
      action: () => window.location.assign("/course-builder"),
    },
    {
      id: "logo",
      title: "Загрузите логотип школы",
      description: "Брендирование сделает кабинет узнаваемым для учеников.",
      done: hasLogo,
      cta: "Открыть профиль",
      action: () => d.tabNavigation.setActiveTab("profile" as any),
    },
    {
      id: "link",
      title: "Создайте ссылку для регистрации",
      description: "Поделитесь ей с учениками — они сами зарегистрируются.",
      done: !!hasLink,
      cta: "Создать ссылку",
      action: () => d.tabNavigation.setActiveTab("links" as any),
    },
    {
      id: "student",
      title: "Пригласите первого ученика",
      description: "Добавьте вручную или загрузите список из Excel.",
      done: !!hasStudent,
      cta: "Открыть учеников",
      action: () => d.tabNavigation.setActiveTab("students" as any),
    },
    {
      id: "plan",
      title: "Выберите тариф",
      description: "Бесплатный тариф ограничен. Расширьте лимиты по мере роста.",
      done: !!hasPaidPlan,
      cta: "Открыть тариф",
      action: () => d.tabNavigation.setActiveTab("subscription" as any),
    },
  ], [hasCourse, hasLogo, hasLink, hasStudent, hasPaidPlan, d.tabNavigation]);

  const doneCount = steps.filter(s => s.done).length;
  const total = steps.length;
  const allDone = doneCount === total;
  const percent = Math.round((doneCount / total) * 100);

  // Auto-hide when all done OR user dismissed
  if (!orgId || dismissed || allDone) return null;
  // Don't show until detection is done (avoid flicker)
  if (hasLink === null || hasStudent === null) return null;

  const handleDismiss = () => {
    if (dismissKey) {
      try { localStorage.setItem(dismissKey, "1"); } catch {}
    }
    setDismissed(true);
  };

  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-base text-foreground">
              Быстрый старт
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Выполнено {doneCount} из {total} — {percent}%. После завершения карточка скроется.
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted"
          aria-label="Скрыть"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mb-4">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Steps */}
      <ul className="space-y-2">
        {steps.map((step) => (
          <li
            key={step.id}
            className={cn(
              "flex items-center gap-3 rounded-xl p-2.5 transition-colors",
              step.done ? "bg-primary/5" : "hover:bg-muted/50"
            )}
          >
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full shrink-0",
              step.done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              {step.done ? <Check className="w-4 h-4" /> : <Circle className="w-3.5 h-3.5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium",
                step.done ? "text-foreground/60 line-through" : "text-foreground"
              )}>
                {step.title}
              </p>
              <p className="text-xs text-muted-foreground hidden sm:block">{step.description}</p>
            </div>
            {!step.done && (
              <Button size="sm" variant="ghost" className="rounded-lg gap-1 shrink-0 text-xs" onClick={step.action}>
                {step.cta}
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
