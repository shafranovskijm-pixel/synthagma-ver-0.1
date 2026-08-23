import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Eye, LockKeyhole, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isMailingEnabled } from "@/lib/mailing/mailingAccess";
import { subscriptionTabPath } from "@/lib/organization/subscriptionNavigation";

interface MailingFeatureGateProps {
  children: (access: { canWrite: boolean }) => ReactNode;
}

function GateCard({
  icon: Icon,
  title,
  description,
  action,
  testId,
}: {
  icon: typeof LockKeyhole;
  title: string;
  description: string;
  action?: ReactNode;
  testId: string;
}) {
  return (
    <div className="container mx-auto px-4 py-10" data-testid={testId}>
      <Card className="mx-auto max-w-2xl border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
        <CardContent className="flex flex-col items-center px-6 py-10 text-center sm:px-10">
          <span className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-7 w-7" />
          </span>
          <h2 className="font-display text-2xl font-semibold">{title}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
          {action && <div className="mt-7">{action}</div>}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Client-side UX boundary for the organization mailing workspace.
 *
 * Authentication and tenant membership remain enforced by ProtectedRoute and
 * OrgDashboardProvider. Database RLS / Edge Functions remain the server-side
 * authority for sales.read and sales.write.
 */
export function MailingFeatureGate({ children }: MailingFeatureGateProps) {
  const { organizationId, isLoadingCourses, subscriptionLimits } = useOrgDashboard();
  const { can, loading: permissionsLoading } = useStaffPermissions();

  const loadingOrganization = !organizationId && isLoadingCourses;
  const loadingSubscription = !subscriptionLimits || subscriptionLimits.loading;

  if (loadingOrganization || (organizationId && (loadingSubscription || permissionsLoading))) {
    return (
      <div className="container mx-auto px-4 py-10 text-center text-sm text-muted-foreground" role="status">
        Проверяем доступ к рассылкам…
      </div>
    );
  }

  if (!organizationId) {
    return (
      <GateCard
        icon={ShieldAlert}
        title="Организация не найдена"
        description="Рассылки открываются только из кабинета организации, к которой у текущей учётной записи есть доступ."
        testId="mailing-organization-missing"
      />
    );
  }

  if (!can("sales.read")) {
    return (
      <GateCard
        icon={ShieldAlert}
        title="Нет доступа к рассылкам"
        description="Обратитесь к администратору организации, чтобы получить право на просмотр раздела продаж и рассылок."
        testId="mailing-permission-denied"
      />
    );
  }

  const plan = subscriptionLimits.plan;
  const mailingEnabled = isMailingEnabled(plan, subscriptionLimits.limits.emailCampaignsEnabled);

  if (!mailingEnabled) {
    return (
      <GateCard
        icon={LockKeyhole}
        title="Email-рассылки недоступны на текущем тарифе"
        description="Выберите тариф, в который входят email-рассылки. Ваши курсы, ученики и документы останутся без изменений."
        action={(
          <Button asChild>
            <Link to={subscriptionTabPath()}>Перейти к тарифам</Link>
          </Button>
        )}
        testId="mailing-plan-locked"
      />
    );
  }

  const canWrite = can("sales.write");

  return (
    <>
      {!canWrite && (
        <div className="container mx-auto px-4 pt-5" data-testid="mailing-readonly-notice">
          <div className="flex items-start gap-3 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <Eye className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Режим просмотра: для создания кампаний, настройки отправителей и других изменений
              требуется право на редактирование продаж.
            </p>
          </div>
        </div>
      )}
      {children({ canWrite })}
    </>
  );
}
