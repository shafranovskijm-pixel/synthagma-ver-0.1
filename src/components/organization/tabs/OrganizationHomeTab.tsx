import {
  ArrowRight,
  BookOpen,
  Building2,
  FileText,
  Lock,
  MessageCircle,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { QuickStartCard } from "@/components/organization/QuickStartCard";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { isMailingEnabled } from "@/lib/mailing/mailingAccess";
import { organizationMailingPath } from "@/lib/organization/workspaceNavigation";
import { cn } from "@/lib/utils";
import { StatsCards } from "./StatsCards";

interface WorkspaceCardProps {
  title: string;
  description: string;
  actionLabel: string;
  icon: typeof BookOpen;
  onOpen: () => void;
  badge?: string;
  locked?: boolean;
}

function WorkspaceCard({
  title,
  description,
  actionLabel,
  icon: Icon,
  onOpen,
  badge,
  locked = false,
}: WorkspaceCardProps) {
  return (
    <article className="group rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        {badge && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <h2 className="mt-4 font-display text-base font-semibold">{title}</h2>
      <p className="mt-1 min-h-10 text-sm leading-relaxed text-muted-foreground">{description}</p>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "mt-4 inline-flex items-center gap-1.5 text-sm font-semibold transition-colors",
          locked ? "text-muted-foreground" : "text-primary hover:text-primary/80",
        )}
      >
        {locked && <Lock className="h-3.5 w-3.5" />}
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>
    </article>
  );
}

export function OrganizationHomeTab() {
  const d = useOrgDashboard();
  const navigate = useNavigate();
  const { can, canSeeOrgTab, loading: permissionsLoading } = useStaffPermissions();
  const plan = d.subscriptionLimits?.plan;
  const mailingEnabled = isMailingEnabled(
    plan,
    d.subscriptionLimits?.limits.emailCampaignsEnabled,
  );
  const canReadCourses = !permissionsLoading && canSeeOrgTab("courses") && can("courses.read");
  const canReadStudents = !permissionsLoading && canSeeOrgTab("students") && can("students.read");
  const canReadCompanies = !permissionsLoading && canSeeOrgTab("organizations") && can("companies.read");
  const canReadDocuments = !permissionsLoading && canSeeOrgTab("documents") && can("documents.read");
  const canReadChats = !permissionsLoading && canSeeOrgTab("chats") && can("chats.read");
  const canReadMailing = !permissionsLoading
    && canSeeOrgTab("mailing")
    && can("sales.read")
    && mailingEnabled;
  const canCreateCourse = canReadCourses
    && can("courses.write")
    && d.subscriptionLimits?.canCreateCourse === true;
  const canAddStudent = canReadStudents
    && can("students.write")
    && d.subscriptionLimits?.canAddStudent === true;
  const showCommunications = canReadChats || canReadMailing;
  const isMailingLocked = !canReadMailing;
  const organizationLabel =
    d.branding.brandingSettings.customName || d.organizationName || "вашей организации";

  const openTab = (tab: Parameters<typeof d.tabNavigation.setActiveTab>[0]) => {
    d.tabNavigation.setActiveTab(tab);
  };

  const createCourse = () => {
    if (!canCreateCourse) return;
    openTab("courses");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("org-create-course")), 100);
  };

  const addStudent = () => {
    if (!canAddStudent) return;
    openTab("students");
    window.setTimeout(
      () => d.studentManagement?.setShowAddStudentDialog?.(true),
      100,
    );
  };

  return (
    <div className="space-y-6" data-testid="organization-home">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between lg:p-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Рабочий стол</p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight lg:text-3xl">
            {organizationLabel}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Курсы, ученики, документы и коммуникации — в одном рабочем цикле.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAddStudent && (
            <Button variant="outline" className="rounded-xl" onClick={addStudent}>
              <Users className="mr-2 h-4 w-4" />
              Добавить ученика
            </Button>
          )}
          {canCreateCourse && (
            <Button className="rounded-xl" onClick={createCourse}>
              <BookOpen className="mr-2 h-4 w-4" />
              Создать курс
            </Button>
          )}
        </div>
      </section>

      {!permissionsLoading && (
        <QuickStartCard courses={d.courses} isLoadingCourses={d.isLoadingCourses} />
      )}

      <StatsCards
        stats={d.stats}
        hasData={d.hasSummaryData}
        isLoading={d.isSummaryLoading}
        errorKind={d.summaryErrorKind}
        onRetry={d.retrySummary}
      />

      <section aria-labelledby="workspaces-title">
        <div className="mb-3">
          <h2 id="workspaces-title" className="font-display text-lg font-semibold">Основные разделы</h2>
          <p className="text-sm text-muted-foreground">Выберите задачу — специальные инструменты откроются внутри раздела.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {canReadCourses && (
            <WorkspaceCard
              title="Курсы"
              description="Создание программ, материалы, домашние работы и готовые курсы."
              actionLabel="Открыть курсы"
              icon={BookOpen}
              onOpen={() => openTab("courses")}
            />
          )}
          {canReadStudents && (
            <WorkspaceCard
              title="Ученики и группы"
              description="Карточки учеников, зачисление, группы и ссылки регистрации."
              actionLabel="Открыть учеников"
              icon={Users}
              onOpen={() => openTab("students")}
            />
          )}
          {canReadCompanies && (
            <WorkspaceCard
              title="Компании"
              description="Заказчики, их ученики, договоры, счета и закрывающие документы."
              actionLabel="Открыть компании"
              icon={Building2}
              onOpen={() => openTab("organizations")}
            />
          )}
          {canReadDocuments && (
            <WorkspaceCard
              title="Документы"
              description="Личные дела, документы групп, журналы и подготовка ФИС ФРДО."
              actionLabel="Открыть документы"
              icon={FileText}
              onOpen={() => openTab("documents")}
            />
          )}
          {showCommunications && (
            <WorkspaceCard
              title="Коммуникации"
              description={
                isMailingLocked
                  ? "Чаты доступны сейчас. Email-рассылки подключаются с тарифа Старт."
                  : "Чаты, email-рассылки, база контактов, шаблоны и отчёты."
              }
              actionLabel={isMailingLocked ? "Открыть чаты" : "Открыть коммуникации"}
              badge={isMailingLocked ? "Рассылки — от Старт" : "Рассылки — Beta"}
              locked={isMailingLocked}
              icon={MessageCircle}
              onOpen={() => {
                if (canReadChats) openTab("chats");
                else navigate(organizationMailingPath("overview"));
              }}
            />
          )}
        </div>
      </section>
    </div>
  );
}
