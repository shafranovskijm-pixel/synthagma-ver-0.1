import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CreditCard,
  Image,
  Sparkles,
  UserCog,
  X,
} from "lucide-react";
import { fetchOrganizationStudentsCounts } from "@/api/students";
import { Button } from "@/components/ui/button";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { supabase } from "@/integrations/supabase/client";
import { groupFolderPath } from "@/lib/groups/groupContext";
import { hasOrganizationCourse, isSystemWelcomeCourse } from "@/lib/organization/firstRun";
import { subscriptionTabPath } from "@/lib/organization/subscriptionNavigation";
import { cn } from "@/lib/utils";

const DISMISS_KEY_PREFIX = "org-quickstart-dismissed-";

interface RequiredStep {
  id: "course" | "student" | "enrollment" | "documents";
  title: string;
  description: string;
  done: boolean;
  cta: string;
  action: () => void;
}

interface FirstRunProgress {
  hasStudent: boolean;
  hasEnrollment: boolean;
  hasDocuments: boolean;
  groupId: string | null;
}

interface QuickStartCardProps {
  courses?: Array<{ id: string; title?: string | null; system_key?: string | null }>;
  isLoadingCourses?: boolean;
  onDismiss?: () => void;
}

/**
 * A single, ordered first-run path for a new organization.
 *
 * The seeded welcome course remains available as help content, but is not a
 * user-created course and therefore never completes the first required step.
 * Student, enrollment and document completion are read from existing APIs;
 * failed/unknown reads remain conservatively incomplete.
 */
export function QuickStartCard({ courses, isLoadingCourses, onDismiss }: QuickStartCardProps = {}) {
  const d = useOrgDashboard();
  const navigate = useNavigate();
  const { can } = useStaffPermissions();
  const orgId = d.organizationId;
  const dismissKey = orgId ? `${DISMISS_KEY_PREFIX}${orgId}` : null;

  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState<FirstRunProgress | null>(null);

  const sourceCourses = useMemo(() => courses ?? d.courses ?? [], [courses, d.courses]);
  const coursesAreLoading = isLoadingCourses ?? d.isLoadingCourses;
  const ownCourses = useMemo(
    () => sourceCourses.filter((course) => !isSystemWelcomeCourse(course)),
    [sourceCourses],
  );
  const ownCourseIds = useMemo(() => ownCourses.map((course) => course.id), [ownCourses]);
  const ownCourseIdsKey = ownCourseIds.join("|");
  const hasOwnCourse = hasOrganizationCourse(sourceCourses);
  const firstOwnCourse = ownCourses[0];
  const canCompleteWorkflow =
    can("courses.write") && can("students.write") && can("documents.write");

  useEffect(() => {
    if (!dismissKey) {
      setDismissed(false);
      return;
    }
    try {
      const wasDismissed = localStorage.getItem(dismissKey) === "1";
      setDismissed(wasDismissed);
      if (wasDismissed) onDismiss?.();
    } catch {
      setDismissed(false);
    }
  }, [dismissKey, onDismiss]);

  useEffect(() => {
    if (!orgId) {
      setProgress(null);
      return;
    }

    let cancelled = false;
    setProgress(null);
    const scopedCourseIds = ownCourseIdsKey ? ownCourseIdsKey.split("|") : [];

    const loadEnrollmentStatus = async () => {
      if (scopedCourseIds.length === 0) return false;
      const { count, error } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .in("course_id", scopedCourseIds);
      if (error) throw error;
      return (count ?? 0) > 0;
    };

    const loadGroupDocumentStatus = async () => {
      if (scopedCourseIds.length === 0) return { hasDocuments: false, groupId: null };
      const { data: groups, error: groupError } = await supabase
        .from("student_groups")
        .select("id")
        .eq("organization_id", orgId)
        .in("course_id", scopedCourseIds);
      if (groupError) throw groupError;
      const groupIds = (groups ?? []).map((group) => group.id);
      if (groupIds.length === 0) return { hasDocuments: false, groupId: null };

      const { data: documents, error } = await supabase
        .from("group_documents")
        .select("group_id")
        .eq("organization_id", orgId)
        .in("group_id", groupIds)
        .eq("is_current", true)
        .neq("generation_status", "failed");
      if (error) throw error;
      const documentGroupId = documents?.find((document) => document.group_id)?.group_id;
      return {
        hasDocuments: (documents?.length ?? 0) > 0,
        // If no document exists yet, open a real eligible group so the CTA can
        // take the user straight to the document workspace.
        groupId: documentGroupId ?? groupIds[0],
      };
    };

    (async () => {
      const [studentResult, enrollmentResult, documentResult] = await Promise.allSettled([
        fetchOrganizationStudentsCounts(orgId),
        loadEnrollmentStatus(),
        loadGroupDocumentStatus(),
      ]);
      if (cancelled) return;

      setProgress({
        hasStudent:
          studentResult.status === "fulfilled" && studentResult.value.active_count > 0,
        hasEnrollment:
          enrollmentResult.status === "fulfilled" && enrollmentResult.value,
        hasDocuments:
          documentResult.status === "fulfilled" && documentResult.value.hasDocuments,
        groupId:
          documentResult.status === "fulfilled" ? documentResult.value.groupId : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, ownCourseIdsKey]);

  const steps: RequiredStep[] = useMemo(
    () => [
      {
        id: "course",
        title: "Создайте собственный курс",
        description:
          "Создайте рабочий курс организации. Приветственный курс СИНТАГМЫ останется как инструкция и не считается вашим курсом.",
        done: hasOwnCourse,
        cta: "Создать курс",
        action: () => {
          d.tabNavigation.setActiveTab("courses" as any);
          setTimeout(() => window.dispatchEvent(new CustomEvent("org-create-course")), 100);
        },
      },
      {
        id: "student",
        title: "Добавьте ученика",
        description:
          "Создайте карточку ученика. При необходимости опубликованный курс можно выбрать сразу в форме добавления.",
        done: progress?.hasStudent ?? false,
        cta: "Добавить ученика",
        action: () => {
          d.tabNavigation.setActiveTab("students" as any);
          setTimeout(() => d.studentManagement?.setShowAddStudentDialog?.(true), 100);
        },
      },
      {
        id: "enrollment",
        title: "Зачислите ученика на курс",
        description:
          "Откройте свой курс, при необходимости опубликуйте его и зачислите добавленного ученика.",
        done: progress?.hasEnrollment ?? false,
        cta: "Открыть курс",
        action: () => {
          if (firstOwnCourse) {
            d.tabNavigation.openCourseDetails(firstOwnCourse.id);
          } else {
            d.tabNavigation.setActiveTab("courses" as any);
          }
        },
      },
      {
        id: "documents",
        title: "Подготовьте документы",
        description:
          progress?.groupId
            ? "Откройте папку учебной группы и подготовьте первый актуальный комплект документов по обучению."
            : "Создайте учебную группу для курса, добавьте участников и затем подготовьте документы группы.",
        done: progress?.hasDocuments ?? false,
        cta: progress?.groupId ? "Открыть документы группы" : "Открыть группы",
        action: () => {
          if (progress?.groupId) navigate(groupFolderPath(progress.groupId, "docs"));
          else d.tabNavigation.setActiveTab("students" as any);
        },
      },
    ],
    [d, firstOwnCourse, hasOwnCourse, navigate, progress],
  );

  const currentStepIndex = steps.findIndex((step) => !step.done);
  const allDone = currentStepIndex === -1;
  const doneCount = steps.filter((step) => step.done).length;
  const hasLogo = !!d.branding.brandingSettings.logoUrl;
  const hasPaidPlan = !!d.subscriptionLimits?.plan && d.subscriptionLimits.plan !== "free";

  if (!orgId || dismissed || allDone || !canCompleteWorkflow) return null;
  if (progress === null || coursesAreLoading) {
    return (
      <section className="mb-6 rounded-2xl border border-primary/20 bg-card p-5 shadow-sm" aria-busy="true">
        <p className="font-display text-base font-semibold">Первый запуск</p>
        <p className="mt-1 text-sm text-muted-foreground">Проверяем текущие курсы, учеников и документы…</p>
      </section>
    );
  }

  const handleDismiss = () => {
    if (dismissKey) {
      try {
        localStorage.setItem(dismissKey, "1");
      } catch {
        // The checklist still closes for this session when storage is unavailable.
      }
    }
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <section
      className="mb-6 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background p-5 shadow-sm"
      aria-labelledby="first-run-title"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h3 id="first-run-title" className="font-display text-base font-semibold text-foreground">
              Первый запуск
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Выполнено {doneCount} из {steps.length}. Сейчас — шаг {currentStepIndex + 1}.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Скрыть первый запуск"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }}
        />
      </div>

      <ol className="space-y-2">
        {steps.map((step, index) => {
          const isCurrent = index === currentStepIndex;
          return (
            <li
              key={step.id}
              data-testid={`quickstart-step-${step.id}`}
              data-step-state={step.done ? "done" : isCurrent ? "current" : "upcoming"}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "rounded-xl border transition-colors",
                isCurrent
                  ? "border-primary/30 bg-primary/5 p-4"
                  : "border-transparent bg-muted/25 px-3 py-2.5",
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    step.done
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {step.done ? <Check className="h-4 w-4" /> : isCurrent ? index + 1 : <Circle className="h-3.5 w-3.5" />}
                </div>
                <p className={cn("text-sm font-medium", step.done && "text-muted-foreground line-through")}>
                  {step.title}
                </p>
              </div>

              {isCurrent && (
                <div className="ml-10 mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                  <Button
                    type="button"
                    data-testid="quickstart-primary-action"
                    className="shrink-0 gap-1.5 rounded-xl"
                    onClick={step.action}
                  >
                    {step.cta}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <details className="group mt-4 border-t border-border/60 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground">
          <span>Можно сделать позже</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {can("settings.write") && (
            <button
              type="button"
              data-testid="quickstart-later-logo"
              onClick={() => d.tabNavigation.setActiveTab("profile" as any)}
              className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
            >
              {hasLogo ? <Check className="h-4 w-4 text-primary" /> : <Image className="h-4 w-4" />}
              <span>{hasLogo ? "Логотип загружен" : "Загрузить логотип"}</span>
            </button>
          )}
          {can("staff.write") && (
            <button
              type="button"
              data-testid="quickstart-later-staff"
              onClick={() => d.tabNavigation.setActiveTab("staff" as any)}
              className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
            >
              <UserCog className="h-4 w-4" />
              <span>Добавить сотрудника</span>
            </button>
          )}
          {can("billing.read") && (
            <Link
              to={subscriptionTabPath()}
              data-testid="quickstart-plan"
              className="flex items-center gap-2 rounded-xl border border-border/60 p-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
            >
              {hasPaidPlan ? <Check className="h-4 w-4 text-primary" /> : <CreditCard className="h-4 w-4" />}
              <span>{hasPaidPlan ? "Тариф настроен" : "Выбрать тариф"}</span>
            </Link>
          )}
        </div>
      </details>
    </section>
  );
}
