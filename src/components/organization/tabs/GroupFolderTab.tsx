import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Folder, FolderOpen, Home, FileText, IdCard, FileSignature, GraduationCap, Users, UserPlus, Calendar, LayoutGrid, List, Table as TableIcon, Settings, BookOpen, ClipboardList, Shield, ExternalLink, ChevronUp, ChevronRight, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { format } from "date-fns";
import { toast } from "sonner";
import { ContractsFolder } from "@/components/organization/group-folder/ContractsFolder";
import { GroupDocumentsFolder } from "@/components/organization/group-folder/GroupDocumentsFolder";
import type { GenerationContext } from "@/lib/group-docs/schema";
import { getGroupDocumentTypes, GROUP_DOCUMENT_TYPE_MAP } from "@/lib/groupDocuments";
import { GroupSettingsDialog } from "@/components/organization/GroupSettingsDialog";
import { canonicalCourseHours, programHoursMismatch, resolveUniqueCommonCourseId } from "@/lib/groups/groupSettings";
import {
  confirmedReadinessCount,
  resolveDocumentsReadiness,
  resolveFrdoReadinessStage,
  resolveLearningReadiness,
  resolveParticipantsReadiness,
  type EnrollmentEvidence,
  type ProofStatus,
} from "@/lib/groups/releaseReadiness";
import { useGroupFolderCounts } from "@/hooks/useGroupFolderCounts";
import { courseDetailsPathForGroup, groupContextPath, studentDetailsPath } from "@/lib/groups/groupContext";
import { frdoReadinessLabel, resolveFrdoReadiness } from "@/lib/frdo/readiness";
import { resolveGroupDocumentClientProfile } from "@/lib/group-docs/clientProfile";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import type { Permission } from "@/constants/rolePermissions";
import { AddStudentsToGroupDialog } from "@/components/organization/groups/AddStudentsToGroupDialog";




type ViewMode = "grid" | "list" | "table";

interface GroupFolderTabProps {
  organizationId: string;
  groupId: string;
}

interface GroupData {
  id: string;
  name: string;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
  group_number: string | null;
  program_title: string | null;
  program_hours: number | null;
  program_form: string | null;
  schedule_text?: string | null;
  instructor_name?: string | null;
  training_dates?: string[] | null;
  default_price: number | null;
  course_id: string | null;
}

interface CourseInfo {
  id: string;
  title: string | null;
  duration: number | null;
  frdo_duration_hours: number | null;
  training_form: string | null;
}

interface StudentRow {
  user_id: string;
  full_name: string;
  email: string | null;
  login: string | null;
  phone: string | null;
  documents: {
    passport: number;
    snils: number;
  };
  frdo?: {
    last_name?: string | null;
    first_name?: string | null;
    middle_name?: string | null;
    birth_date: string | null;
    gender: string | null;
    snils: string | null;
    citizenship_code: string | null;
    education_level: string | null;
    passport_series: string | null;
    passport_number: string | null;
  } | null;
  contracts_count: number;
  test_attempts_count: number;
}

type FolderKey = "contracts" | "passports" | "snils" | "exams" | "docs";

export const GROUP_WORKFLOW_ITEMS = [
  { id: "participants", label: "Участники", destination: "members", permission: "students.read", beta: false },
  { id: "learning", label: "Обучение", destination: "journals", permission: "courses.read", beta: false },
  { id: "personal-files", label: "Личные дела", destination: "explorer", permission: "documents.read", beta: false },
  { id: "group-documents", label: "Документы группы", destination: "docs", permission: "documents.read", beta: true },
  { id: "frdo", label: "ФИС ФРДО", destination: "frdo", permission: "frdo.read", beta: false },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  destination: string;
  permission: Permission;
  beta: boolean;
}>;

type GroupWorkflowItem = (typeof GROUP_WORKFLOW_ITEMS)[number];

export function getVisibleGroupWorkflowItems(can: (permission: Permission) => boolean) {
  return GROUP_WORKFLOW_ITEMS.filter((item) => can(item.permission));
}

export const GROUP_WORKFLOW_LAYOUT_CLASSES = {
  breadcrumbs: "flex min-w-0 items-center gap-2 text-sm text-muted-foreground",
  breadcrumbCurrent: "min-w-0 truncate font-medium text-foreground",
  navigation: "grid grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-2",
  item: "group flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors",
  headerActions: "grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center",
  readinessBadge: "shrink-0 self-start whitespace-nowrap rounded-full sm:self-auto",
} as const;

const FOLDER_META: Record<FolderKey, { title: string; icon: any; hint: string }> = {
  contracts: { title: GROUP_DOCUMENT_TYPE_MAP.contract.title, icon: FileSignature, hint: GROUP_DOCUMENT_TYPE_MAP.contract.hint || "Договоры с учениками группы" },
  passports: { title: "Паспорта", icon: IdCard, hint: "Сканы паспортов учеников" },
  snils: { title: "СНИЛС", icon: IdCard, hint: "Сканы СНИЛС учеников" },
  exams: { title: "Экзамены", icon: GraduationCap, hint: "Попытки и результаты аттестации" },
  docs: { title: "Документы группы", icon: FileText, hint: "Приказы, журналы, ведомости, книга регистрации" },
};


export function GroupFolderTab({ organizationId, groupId }: GroupFolderTabProps) {
  const d = useOrgDashboard();
  const { can, loading: permissionsLoading } = useStaffPermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showMembers, setShowMembers] = useState(false);
  const [loading, setLoading] = useState(true);

  const [group, setGroup] = useState<GroupData | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [orgInfo, setOrgInfo] = useState<any | null>(null);
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [courseEnrollments, setCourseEnrollments] = useState<EnrollmentEvidence[]>([]);
  const [courseEnrollmentEvidenceError, setCourseEnrollmentEvidenceError] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addStudentsOpen, setAddStudentsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const folderParam = searchParams.get("folder");
  const openFolder = (["contracts","passports","snils","exams","docs"] as const).includes(folderParam as any) ? (folderParam as FolderKey) : null;
  const setOpenFolder = useCallback((f: FolderKey | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (f) next.set("folder", f); else next.delete("folder");
      return next;
    });
  }, [setSearchParams]);
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem("groupFolderView") as ViewMode) || "grid");

  // Deep-link «Изменить в настройках группы»: ?groupSettings=1 открывает диалог
  // настроек текущей группы и сразу убирает параметр из URL.
  useEffect(() => {
    if (searchParams.get("groupSettings") !== "1") return;
    setSettingsOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("groupSettings");
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  // Durable deep-link from the first-run checklist. The intent remains in
  // the URL until this workspace mounts, so slow rendering cannot lose it.
  useEffect(() => {
    if (searchParams.get("addStudents") !== "1") return;
    setShowMembers(true);
    setAddStudentsOpen(true);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("addStudents");
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => { localStorage.setItem("groupFolderView", viewMode); }, [viewMode]);

  const backToStudentsGroups = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "students");
      next.set("studentsView", "groups");
      next.delete("groupId");
      next.delete("folder");
      return next;
    });
  }, [setSearchParams]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setGroup(null);
      setCourseInfo(null);
      setCourseEnrollments([]);
      setCourseEnrollmentEvidenceError(false);
      setStudents([]);
      try {
        const { data: groupData } = await supabase
          .from("student_groups")
          .select("id, name, color, start_date, end_date, group_number, program_title, program_hours, program_form, schedule_text, instructor_name, training_dates, default_price, course_id")
          .eq("id", groupId)
          .eq("organization_id", organizationId)
          .maybeSingle();
        if (cancelled) return;
        if (!groupData) return;
        setGroup(groupData as any as GroupData | null);

        const { data: orgRow } = await supabase
          .from("organizations")
          .select("id, name, inn, kpp, ogrn, legal_address, actual_address, director_name, director_position, bank_name, bank_bik, bank_account, bank_corr_account, email, phone")
          .eq("id", organizationId)
          .maybeSingle();
        if (!cancelled) setOrgInfo(orgRow as any);

        // Курс группы: явная привязка, иначе — общий курс по зачислениям учеников
        const linkedCourseId = (groupData as any)?.course_id as string | null;

        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, login, phone")
          .eq("organization_id", organizationId)
          .eq("student_group_id", groupId)
          .is("archived_at", null);

        const userIds = (profiles || []).map((p: any) => p.user_id);
        if (!cancelled) {
          setCourseEnrollments([]);
          setCourseEnrollmentEvidenceError(false);
        }

        let resolvedCourseId: string | null = linkedCourseId;
        if (!resolvedCourseId && userIds.length > 0) {
          const { data: enrollments } = await (supabase as any)
            .from("enrollments")
            .select("course_id, user_id")
            .in("user_id", userIds);
          resolvedCourseId = resolveUniqueCommonCourseId((enrollments as any[]) || [], userIds);
        }
        if (resolvedCourseId) {
          const { data: courseRow } = await supabase
            .from("courses")
            .select("id, title, duration, frdo_duration_hours, training_form")
            .eq("id", resolvedCourseId)
            .eq("organization_id", organizationId)
            .maybeSingle();
          if (!courseRow) {
            resolvedCourseId = null;
            if (!cancelled) setCourseInfo(null);
          } else if (!cancelled) {
            setCourseInfo(courseRow as any);
          }
          if (resolvedCourseId && userIds.length > 0) {
            const { data: enrollmentRows, error: enrollmentError } = await (supabase as any)
              .from("enrollments")
              .select("user_id, status, progress, completed_at")
              .eq("course_id", resolvedCourseId)
              .in("user_id", userIds);
            if (!cancelled) {
              setCourseEnrollmentEvidenceError(Boolean(enrollmentError));
              setCourseEnrollments(enrollmentError ? [] : (enrollmentRows || []) as EnrollmentEvidence[]);
            }
          }
        } else if (!cancelled) {
          setCourseInfo(null);
        }

        if (userIds.length === 0) {
          if (!cancelled) setStudents([]);
          return;
        }

        const [docsRes, contractsRes, attemptsRes, frdoRes] = await Promise.all([
          (supabase as any)
            .from("student_identity_documents")
            .select("user_id, type")
            .in("user_id", userIds),
          (supabase as any)
            .from("org_contracts")
            .select("id, student_user_id")
            .eq("organization_id", organizationId)
            .in("student_user_id", userIds),
          (supabase as any)
            .from("test_attempts")
            .select("id, user_id")
            .in("user_id", userIds),
          (supabase as any)
            .from("student_frdo_data")
            .select("user_id, last_name, first_name, middle_name, birth_date, gender, snils, citizenship_code, education_level, passport_series, passport_number")
            .in("user_id", userIds),
        ]);


        const docsByUser = new Map<string, { passport: number; snils: number }>();
        for (const row of (docsRes.data as any[]) || []) {
          const cur = docsByUser.get(row.user_id) || { passport: 0, snils: 0 };
          if (row.type === "passport") cur.passport += 1;
          if (row.type === "snils") cur.snils += 1;
          docsByUser.set(row.user_id, cur);
        }
        const contractsByUser = new Map<string, number>();
        for (const row of (contractsRes.data as any[]) || []) {
          contractsByUser.set(row.student_user_id, (contractsByUser.get(row.student_user_id) || 0) + 1);
        }
        const attemptsByUser = new Map<string, number>();
        for (const row of (attemptsRes.data as any[]) || []) {
          attemptsByUser.set(row.user_id, (attemptsByUser.get(row.user_id) || 0) + 1);
        }
        const frdoByUser = new Map<string, any>();
        for (const row of (frdoRes.data as any[]) || []) {
          frdoByUser.set(row.user_id, row);
        }

        const rows: StudentRow[] = (profiles || []).map((p: any) => ({
          user_id: p.user_id,
          full_name: p.full_name || "—",
          email: p.email,
          login: p.login,
          phone: p.phone ?? null,
          documents: docsByUser.get(p.user_id) || { passport: 0, snils: 0 },
          frdo: frdoByUser.get(p.user_id) || null,
          contracts_count: contractsByUser.get(p.user_id) || 0,
          test_attempts_count: attemptsByUser.get(p.user_id) || 0,
        }));
        if (!cancelled) setStudents(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId, groupId, reloadKey]);

  // Счётчики папок читаются из тех же таблиц, что и содержимое папок.
  const { counts, refresh: refreshCounts } = useGroupFolderCounts(organizationId, groupId);

  // Возврат «К папкам» → пересчитать счётчики (после генерации/удаления внутри папки).
  useEffect(() => {
    if (!openFolder) refreshCounts();
  }, [openFolder, refreshCounts]);




  /** Контекст генерации документов группы: организация + группа + ученики. */
  const generationContext = useMemo<GenerationContext | null>(() => {
    if (!group) return null;
    return {
      organization: {
        id: orgInfo?.id || organizationId,
        name: orgInfo?.name || "",
        inn: orgInfo?.inn || "",
        kpp: orgInfo?.kpp || "",
        ogrn: orgInfo?.ogrn || "",
        address: orgInfo?.legal_address || orgInfo?.actual_address || "",
        director_name: orgInfo?.director_name || "",
        // Fail-closed: должность руководителя только из реквизитов организации.
        director_position: orgInfo?.director_position || "",
        bank_name: orgInfo?.bank_name || "",
        bank_bik: orgInfo?.bank_bik || "",
        bank_account: orgInfo?.bank_account || "",
        bank_corr_account: orgInfo?.bank_corr_account || "",
        email: orgInfo?.email || "",
        phone: orgInfo?.phone || "",
      },
      group: {
        id: group.id,
        name: group.name,
        number: group.group_number || "",
        start_date: group.start_date || "",
        end_date: group.end_date || "",
        program_title: group.program_title || courseInfo?.title || "",
        program_hours: group.program_hours || courseInfo?.frdo_duration_hours || courseInfo?.duration || 0,
        // Fail-closed: форма обучения только из настроек группы. Пустое значение
        // честно блокирует договор, вместо подстановки «типовой» формы.
        program_form: group.program_form || "",
        schedule_text: group.schedule_text || null,
        instructor_name: group.instructor_name || null,
        training_dates: group.training_dates || [],
        color: group.color || undefined,
      },
      students: students.map(s => ({
        user_id: s.user_id,
        full_name: s.full_name,
        birth_date: s.frdo?.birth_date || undefined,
        gender: (s.frdo?.gender === "Ж" || s.frdo?.gender === "female" ? "Ж" : s.frdo?.gender ? "М" : undefined) as "М" | "Ж" | undefined,
        passport: [s.frdo?.passport_series, s.frdo?.passport_number].filter(Boolean).join(" ") || undefined,
        passport_series: s.frdo?.passport_series || undefined,
        passport_number: s.frdo?.passport_number || undefined,
        snils: s.frdo?.snils || undefined,
        citizenship: s.frdo?.citizenship_code || undefined,
        email: s.email || undefined,
        phone: s.phone || undefined,
        education: s.frdo?.education_level || undefined,
      })),
    };
  }, [group, orgInfo, students, courseInfo, organizationId]);

  const resolvedProgramTitle = group?.program_title || courseInfo?.title || "";
  const resolvedCourseId = group?.course_id || courseInfo?.id || null;

  const resolvedProgramHours = group?.program_hours || courseInfo?.frdo_duration_hours || courseInfo?.duration || 0;
  const courseMasterHours = canonicalCourseHours(courseInfo);
  const hasProgramHoursMismatch = programHoursMismatch(group?.program_hours, courseInfo);
  const exactGoreltechDocuments = useMemo(
    () => !!generationContext
      && resolveGroupDocumentClientProfile(generationContext.organization).key === "goreltech",
    [generationContext],
  );

  /** Критичные поля: без них документы бессмысленны — генерация блокируется. */
  const blockingDocFields = useMemo(() => {
    const missing: string[] = [];
    if (!resolvedProgramTitle) missing.push("название программы (или курс группы)");
    if (!resolvedProgramHours) missing.push("объём часов");
    if (hasProgramHoursMismatch) missing.push(`часы группы (${group?.program_hours}) не совпадают с курсом (${courseMasterHours})`);
    if (!orgInfo?.inn) missing.push("ИНН учебного центра");
    // Только клиентский Word-пакет имеет отдельный подтверждаемый выбор
    // подписантов. Универсальные документы сохраняют прежние требования.
    if (!exactGoreltechDocuments && !orgInfo?.director_name) missing.push("руководитель учебного центра");
    if (!exactGoreltechDocuments && !orgInfo?.director_position) missing.push("должность руководителя учебного центра");
    if (!group?.program_form) missing.push("форма обучения группы");
    return missing;
  }, [resolvedProgramTitle, resolvedProgramHours, orgInfo, group?.program_form, group?.program_hours, hasProgramHoursMismatch, courseMasterHours, exactGoreltechDocuments]);

  const missingDocFields = useMemo(() => {
    const missing = [...blockingDocFields];
    if (!group?.group_number) missing.push("номер группы");
    if (!group?.start_date || !group?.end_date) missing.push("даты обучения");
    if (!group?.instructor_name) missing.push("преподаватель для журнала");
    if ((group?.training_dates || []).length !== 4) missing.push("4 даты занятий для журнала");
    return missing;
  }, [blockingDocFields, group]);

  const frdoReadyCount = useMemo(
    () => students.filter(student => resolveFrdoReadiness(student.frdo, student.full_name).status === "complete").length,
    [students],
  );
  const participantsReadiness = resolveParticipantsReadiness(students.length);
  const learningReadiness = resolveLearningReadiness({
    participantUserIds: students.map(student => student.user_id),
    courseId: resolvedCourseId,
    enrollments: courseEnrollments,
    evidenceError: courseEnrollmentEvidenceError,
  });
  const documentsReadiness = resolveDocumentsReadiness({
    missingFieldCount: missingDocFields.length,
    documentCount: Number(counts.docs) || 0,
    contractCount: Number(counts.contracts) || 0,
  });
  const frdoReadiness = resolveFrdoReadinessStage({
    participantCount: students.length,
    completeDataCount: frdoReadyCount,
  });
  const confirmedStepsCount = confirmedReadinessCount([
    participantsReadiness,
    learningReadiness,
    documentsReadiness,
    frdoReadiness,
  ]);




  const generateStudentsListDoc = () => {
    const rows = students.map((s, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(s.full_name)}</td>
        <td>${escapeHtml(s.email || "—")}</td>
        <td>${escapeHtml(s.login || "—")}</td>
      </tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body{font-family:'Times New Roman',serif;font-size:12pt}
      h1{text-align:center;font-size:16pt}
      table{width:100%;border-collapse:collapse;margin-top:20px}
      td,th{border:1px solid #000;padding:6px}
      th{background:#eee}
    </style></head><body>
      <h1>Список обучающихся</h1>
      <p><b>Группа:</b> ${escapeHtml(group?.name || "")}</p>
      <p><b>Период обучения:</b> ${group?.start_date ? format(new Date(group.start_date), "dd.MM.yyyy") : "—"} — ${group?.end_date ? format(new Date(group.end_date), "dd.MM.yyyy") : "—"}</p>
      <p><b>Количество слушателей:</b> ${students.length}</p>
      <table><tr><th>№</th><th>ФИО</th><th>Email</th><th>Логин</th></tr>${rows}</table>
    </body></html>`;
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Список_${(group?.name || "группа").replace(/\s+/g, "_")}.doc`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Список обучающихся сформирован");
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[300px]"><SigmaSpinner size="lg" /></div>;
  }
  if (!group) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => backToStudentsGroups()} className="gap-1.5 rounded-xl">
          <ArrowLeft className="w-4 h-4" /> К ученикам
        </Button>
        <p className="mt-4 text-muted-foreground">Группа не найдена.</p>
      </div>
    );
  }

  const folderCards: Array<{ key: FolderKey; count: number }> = [
    { key: "contracts", count: counts.contracts },
    { key: "passports", count: counts.passports },
    { key: "snils", count: counts.snils },
    { key: "exams", count: counts.exams },
    { key: "docs", count: counts.docs },
  ];
  const currentFolderTitle = openFolder ? FOLDER_META[openFolder].title : "Все папки";
  const currentFolderCount = openFolder
    ? folderCards.find(folder => folder.key === openFolder)?.count ?? 0
    : folderCards.length;
  const readinessSteps = [
    {
      title: "Участники",
      detail: participantsReadiness.detail,
      status: participantsReadiness.status,
      icon: Users,
      action: () => setShowMembers(true),
    },
    {
      title: "Обучение",
      detail: learningReadiness.detail,
      status: learningReadiness.status,
      icon: BookOpen,
      action: () => resolvedCourseId ? navigate(courseDetailsPathForGroup(resolvedCourseId)) : setSettingsOpen(true),
    },
    {
      title: "Документы",
      detail: documentsReadiness.detail,
      status: documentsReadiness.status,
      icon: FileText,
      action: () => setOpenFolder("docs"),
    },
    {
      title: "Данные ФИС ФРДО",
      detail: frdoReadiness.detail,
      status: frdoReadiness.status,
      icon: Shield,
      action: () => navigate(groupContextPath("frdo", { groupId, courseId: resolvedCourseId })),
    },
  ];

  const workflowIcons: Record<GroupWorkflowItem["id"], typeof Users> = {
    participants: Users,
    learning: ClipboardList,
    "personal-files": IdCard,
    "group-documents": FileText,
    frdo: Shield,
  };
  const workflowDetails: Record<GroupWorkflowItem["id"], string> = {
    participants: `${students.length} в группе`,
    learning: "Журналы и ход обучения",
    "personal-files": "Договоры, паспорта и СНИЛС",
    "group-documents": "Приказы, журналы и ведомости",
    frdo: `${frdoReadyCount} из ${students.length} данных заполнено`,
  };
  const visibleWorkflowItems = permissionsLoading
    ? []
    : getVisibleGroupWorkflowItems(can);
  const canManageParticipants = !permissionsLoading && can("students.write");
  const workflowItemIsActive = (item: GroupWorkflowItem) => {
    if (item.destination === "members") return showMembers;
    if (item.destination === "docs") return !showMembers && openFolder === "docs";
    if (item.destination === "explorer") return !showMembers && openFolder !== "docs";
    return false;
  };
  const focusWorkspace = (folder: FolderKey | null) => {
    setShowMembers(false);
    setOpenFolder(folder);
    workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleWorkflowAction = (item: GroupWorkflowItem) => {
    switch (item.destination) {
      case "members":
        setShowMembers(value => !value);
        return;
      case "journals":
        navigate(groupContextPath("journals", { groupId, courseId: resolvedCourseId }));
        return;
      case "explorer":
        focusWorkspace(null);
        return;
      case "docs":
        focusWorkspace("docs");
        return;
      case "frdo":
        navigate(groupContextPath("frdo", { groupId, courseId: resolvedCourseId }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <div className={GROUP_WORKFLOW_LAYOUT_CLASSES.breadcrumbs}>
        <button className="shrink-0 hover:text-foreground" onClick={() => backToStudentsGroups()}>Ученики</button>
        <span className="shrink-0">/</span>
        <span className="shrink-0">Группы</span>
        <span className="shrink-0">/</span>
        <span className={GROUP_WORKFLOW_LAYOUT_CLASSES.breadcrumbCurrent}>{group.name}</span>
      </div>

      {/* Header */}
      <Card className="p-5 rounded-2xl border-border">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex w-full min-w-0 items-center gap-3 sm:flex-1">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: (group.color || "#6366f1") + "22", color: group.color || "#6366f1" }}>
              <Folder className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-xl lg:text-2xl font-semibold truncate">{group.name}</h1>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1"><Users className="w-4 h-4" />{students.length} учеников</span>
                {(group.start_date || group.end_date) && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {group.start_date ? format(new Date(group.start_date), "dd.MM.yyyy") : "—"} — {group.end_date ? format(new Date(group.end_date), "dd.MM.yyyy") : "—"}
                  </span>
                )}
                <span className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
                  <BookOpen className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {resolvedProgramTitle || courseInfo?.title || "Курс не привязан"}
                    {resolvedProgramHours ? ` · ${resolvedProgramHours} ч.` : ""}
                  </span>
                </span>
              </div>

            </div>
          </div>
          <div className={GROUP_WORKFLOW_LAYOUT_CLASSES.headerActions}>
            {canManageParticipants && (
              <Button
                size="sm"
                className="w-full justify-start gap-1.5 rounded-xl sm:w-auto"
                onClick={() => {
                  setShowMembers(true);
                  setAddStudentsOpen(true);
                }}
              >
                <UserPlus className="w-4 h-4" /> Добавить учеников
              </Button>
            )}
            <Button variant="outline" size="sm" className="w-full justify-start gap-1.5 rounded-xl sm:w-auto" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-4 h-4" /> Настройки группы
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-1.5 rounded-xl sm:w-auto" onClick={() => {
              if (openFolder) setOpenFolder(null);
              else backToStudentsGroups();
            }}>
              <ArrowLeft className="w-4 h-4" /> Назад
            </Button>
          </div>
        </div>
      </Card>

      {/* Работа с группой */}
      <Card className="p-4 rounded-2xl border-border">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-semibold">Работа с группой</h2>
            <div className="mt-1 flex items-center gap-2 text-sm min-w-0">
              <BookOpen className="w-4 h-4 text-primary shrink-0" />
              {resolvedCourseId ? (
                <button
                  className="font-medium text-primary hover:underline inline-flex items-center gap-1 truncate"
                  onClick={() => navigate(courseDetailsPathForGroup(resolvedCourseId))}
                >
                  <span className="truncate">{resolvedProgramTitle || courseInfo?.title || "Курс группы"}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </button>
              ) : (
                <button className="text-muted-foreground hover:text-foreground hover:underline" onClick={() => setSettingsOpen(true)}>
                  Курс не привязан — открыть настройки группы
                </button>
              )}
            </div>
          </div>
          <p className="max-w-md text-xs text-muted-foreground">
            Выберите этап — откроется уже существующий рабочий раздел с данными этой группы.
          </p>
        </div>

        <div className="mt-4 pb-1">
          <div className={GROUP_WORKFLOW_LAYOUT_CLASSES.navigation} role="navigation" aria-label="Работа с группой">
            {visibleWorkflowItems.map(item => {
              const Icon = workflowIcons[item.id];
              const active = workflowItemIsActive(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleWorkflowAction(item)}
                  aria-current={active ? "page" : undefined}
                  className={`${GROUP_WORKFLOW_LAYOUT_CLASSES.item} ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:border-primary/30 hover:bg-primary/5"
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? "bg-primary/15" : "bg-muted"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span className="truncate">{item.label}</span>
                      {item.beta && <Badge variant="secondary" className="rounded-full px-1.5 py-0 text-[10px]">Beta</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{workflowDetails[item.id]}</span>
                  </span>
                  {item.destination === "members" && active
                    ? <ChevronUp className="h-4 w-4 shrink-0" />
                    : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {showMembers && (
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
              <div>
                <div className="font-medium">Участники группы</div>
                <div className="text-xs text-muted-foreground">
                  {students.length > 0 ? `${students.length} ученик(ов) добавлено` : "Добавьте учеников, чтобы начать обучение"}
                </div>
              </div>
              {canManageParticipants && (
                <Button size="sm" className="rounded-xl gap-1.5" onClick={() => setAddStudentsOpen(true)}>
                  <UserPlus className="h-4 w-4" /> Добавить учеников
                </Button>
              )}
            </div>
            {students.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </span>
                <div className="font-medium">В группе пока нет учеников</div>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Выберите существующих учеников без группы или создайте нового прямо здесь.
                </p>
                {canManageParticipants && (
                  <Button className="mt-4 rounded-xl gap-2" onClick={() => setAddStudentsOpen(true)}>
                    <UserPlus className="h-4 w-4" /> Добавить первого ученика
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">ФИО</th>
                    <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Документы</th>
                    <th className="text-left px-3 py-2 font-medium hidden lg:table-cell">ФРДО</th>
                    <th className="text-right px-3 py-2 font-medium">Договоры</th>
                    <th className="text-right px-3 py-2 font-medium">Аттестации</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map(s => {
                    const frdo = resolveFrdoReadiness(s.frdo, s.full_name);
                    return (
                      <tr
                        key={s.user_id}
                        className="hover:bg-muted/40 cursor-pointer"
                        onClick={() => navigate(studentDetailsPath(s.user_id))}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-medium truncate">{s.full_name}</div>
                          <div className="text-xs text-muted-foreground truncate">{s.email || s.login || "—"}</div>
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <div className="flex gap-1.5">
                            <Badge variant={s.documents.passport > 0 ? "default" : "outline"} className="rounded-full text-[10px]">
                              Паспорт {s.documents.passport > 0 ? "✓" : "—"}
                            </Badge>
                            <Badge variant={s.documents.snils > 0 ? "default" : "outline"} className="rounded-full text-[10px]">
                              СНИЛС {s.documents.snils > 0 ? "✓" : "—"}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell">
                          <Badge
                            variant={frdo.status === "complete" ? "default" : frdo.status === "incomplete" ? "secondary" : "outline"}
                            className="rounded-full text-[10px]"
                            title={frdo.missingFields.length ? `Не хватает: ${frdo.missingFields.join(", ")}` : undefined}
                          >
                            {frdoReadinessLabel(frdo.status)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{s.contracts_count}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{s.test_attempts_count}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-xl gap-1"
                            onClick={(e) => { e.stopPropagation(); navigate(studentDetailsPath(s.user_id)); }}
                          >
                            Открыть карточку <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="rounded-2xl border-border p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">Предварительная готовность группы</h2>
            <p className="text-sm text-muted-foreground">
              Зелёным отмечены только этапы, подтверждённые данными. Пакет документов и выгрузка ФРДО проверяются отдельно.
            </p>
          </div>
          <Badge
            variant={confirmedStepsCount === readinessSteps.length ? "default" : "secondary"}
            className={GROUP_WORKFLOW_LAYOUT_CLASSES.readinessBadge}
          >
            Подтверждено {confirmedStepsCount} из {readinessSteps.length}
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {readinessSteps.map(step => {
            const statusClass: Record<ProofStatus, string> = {
              ready: "text-emerald-600",
              attention: "text-amber-600",
              blocked: "text-rose-600",
              unknown: "text-muted-foreground",
            };
            return (
            <button
              key={step.title}
              type="button"
              onClick={step.action}
              className="flex items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className={statusClass[step.status]}>
                {step.status === "ready" ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <step.icon className="h-4 w-4" />
                  <span className="truncate">{step.title}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{step.detail}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
            );
          })}
        </div>
      </Card>

      {/* Windows Explorer inspired workspace */}
      <Card ref={workspaceRef} className="overflow-hidden rounded-xl border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md"
            aria-label="Назад к папкам"
            title="Назад к папкам"
            disabled={!openFolder}
            onClick={() => setOpenFolder(null)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md"
            aria-label="Все папки группы"
            title="Все папки группы"
            onClick={() => setOpenFolder(null)}
          >
            <Home className="h-4 w-4" />
          </Button>

          <div className="flex min-w-[260px] flex-1 items-center gap-1 overflow-x-auto rounded-md border border-border bg-background px-3 py-1.5 text-sm shadow-inner">
            <button className="whitespace-nowrap text-muted-foreground hover:text-foreground" onClick={() => backToStudentsGroups()}>Ученики</button>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <button className="whitespace-nowrap text-muted-foreground hover:text-foreground" onClick={() => backToStudentsGroups()}>Группы</button>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <button className="max-w-[260px] truncate whitespace-nowrap font-medium hover:text-primary" onClick={() => setOpenFolder(null)}>{group.name}</button>
            {openFolder && (
              <>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="whitespace-nowrap font-medium">{FOLDER_META[openFolder].title}</span>
              </>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md"
            aria-label="Обновить папки"
            title="Обновить"
            onClick={() => { refreshCounts(); setReloadKey(key => key + 1); }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <ToggleGroup type="single" value={viewMode} onValueChange={v => v && setViewMode(v as ViewMode)} className="rounded-md border border-border bg-background p-0.5">
            <ToggleGroupItem value="grid" size="sm" className="h-7 w-7 rounded p-0" aria-label="Крупные значки" title="Крупные значки"><LayoutGrid className="w-4 h-4" /></ToggleGroupItem>
            <ToggleGroupItem value="list" size="sm" className="h-7 w-7 rounded p-0" aria-label="Список" title="Список"><List className="w-4 h-4" /></ToggleGroupItem>
            <ToggleGroupItem value="table" size="sm" className="h-7 w-7 rounded p-0" aria-label="Таблица" title="Таблица"><TableIcon className="w-4 h-4" /></ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="grid min-h-[520px] lg:grid-cols-[238px_minmax(0,1fr)]">
          <aside className="hidden border-r border-border bg-muted/20 p-3 lg:block">
            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Быстрый доступ</div>
            <button
              onClick={() => setOpenFolder(null)}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${!openFolder ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
            >
              <Home className="h-4 w-4 shrink-0" />
              <span className="truncate">Главная группы</span>
            </button>

            <div className="mt-4 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Папки</div>
            <div className="space-y-0.5">
              {folderCards.map(({ key, count }) => {
                const meta = FOLDER_META[key];
                return (
                  <button
                    key={key}
                    onClick={() => setOpenFolder(key)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${openFolder === key ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"}`}
                  >
                    {openFolder === key ? <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" /> : <Folder className="h-4 w-4 shrink-0 text-amber-500" />}
                    <span className="min-w-0 flex-1 truncate">{meta.title}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-lg border border-border bg-background/70 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{group.name}</div>
              <div className="mt-1">{students.length} учеников</div>
              <div>{resolvedProgramHours ? `${resolvedProgramHours} часов` : "Часы не указаны"}</div>
            </div>
          </aside>

          <section className="min-w-0 bg-background">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {openFolder ? <FolderOpen className="h-7 w-7 shrink-0 text-amber-500" /> : <Folder className="h-7 w-7 shrink-0 text-amber-500" />}
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{currentFolderTitle}</h2>
                  <p className="text-xs text-muted-foreground">{currentFolderCount} {openFolder ? "файл(ов)" : "папок"}</p>
                </div>
              </div>
              {openFolder && (
                <Button variant="outline" size="sm" className="h-8 rounded-md gap-1.5 lg:hidden" onClick={() => setOpenFolder(null)}>
                  <ArrowLeft className="h-4 w-4" /> К папкам
                </Button>
              )}
            </div>

            <div className="p-4">
              {!openFolder ? (
                <FolderList folders={folderCards} viewMode={viewMode} onOpen={setOpenFolder} />
              ) : openFolder === "contracts" ? (
                <ContractsFolder
                  organizationId={organizationId}
                  groupId={groupId}
                  groupName={group?.name || ""}
                  students={students.map(s => ({ user_id: s.user_id, full_name: s.full_name, email: s.email }))}
                  organization={generationContext?.organization ?? null}
                  onDataChanged={refreshCounts}
                />
              ) : openFolder === "docs" ? (
                <GroupDocumentsFolder
                  organizationId={organizationId}
                  groupId={groupId}
                  groupName={group?.name || ""}
                  students={students.map(s => ({ user_id: s.user_id, full_name: s.full_name, email: s.email }))}
                  ctx={generationContext}
                  defaultPrice={group?.default_price ?? null}
                  missingFields={missingDocFields}
                  blockingFields={blockingDocFields}
                  courseId={group?.course_id || courseInfo?.id || null}
                  onOpenGroupSettings={() => setSettingsOpen(true)}
                  onDataChanged={refreshCounts}
                />
              ) : (
                <FolderContents
                  folder={openFolder}
                  students={students}
                  viewMode={viewMode}
                  onBack={() => setOpenFolder(null)}
                  showBackButton={false}
                />
              )}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-1.5 text-xs text-muted-foreground">
          <span>{currentFolderCount} {openFolder ? "элемент(ов)" : "папок"}</span>
          <span className="hidden sm:inline">Данные синхронизированы с группой</span>
        </div>
      </Card>

      <GroupSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        groupId={groupId}
        organizationId={organizationId}
        onUpdated={() => setReloadKey(k => k + 1)}
        onDeleted={() => backToStudentsGroups()}
      />
      <AddStudentsToGroupDialog
        open={addStudentsOpen}
        onOpenChange={setAddStudentsOpen}
        organizationId={organizationId}
        groupId={groupId}
        groupName={group.name}
        onStudentsChanged={(change) => {
          setShowMembers(true);
          setReloadKey((key) => key + 1);
          if (change === "population") d.refreshStudentPopulation();
          else d.refreshStudentGrouping();
        }}
      />
    </div>
  );
}

function FolderList({ folders, viewMode, onOpen }: { folders: Array<{ key: FolderKey; count: number }>; viewMode: ViewMode; onOpen: (k: FolderKey) => void }) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
        {folders.map(({ key, count }) => {
          const meta = FOLDER_META[key];
          const Icon = meta.icon;
          return (
            <button
              key={key}
              onClick={() => onOpen(key)}
              className="group flex min-h-[86px] items-center gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-primary/20 hover:bg-primary/5 focus-visible:border-primary/40 focus-visible:bg-primary/10 focus-visible:outline-none"
            >
              <div className="relative flex h-12 w-14 shrink-0 items-center justify-center text-amber-500">
                <Folder className="h-12 w-12 fill-amber-400/25 stroke-[1.4]" />
                <Icon className="absolute h-4 w-4 text-amber-800" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{meta.title}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">{meta.hint}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{count} файл(ов)</div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <div className="overflow-hidden rounded-lg border border-border divide-y divide-border">
        {folders.map(({ key, count }) => {
          const meta = FOLDER_META[key];
          const Icon = meta.icon;
          return (
            <button key={key} onClick={() => onOpen(key)} className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-primary/5 transition-colors">
              <div className="relative flex h-9 w-10 shrink-0 items-center justify-center text-amber-500">
                <Folder className="h-8 w-8 fill-amber-400/25" />
                <Icon className="absolute h-3.5 w-3.5 text-amber-800" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{meta.title}</div>
                <div className="text-xs text-muted-foreground truncate">{meta.hint}</div>
              </div>
              <Badge variant="secondary" className="rounded-full text-xs shrink-0">{count}</Badge>
            </button>
          );
        })}
      </div>
    );
  }

  // table
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Папка</th>
            <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Описание</th>
            <th className="text-right px-4 py-2 font-medium">Файлов</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {folders.map(({ key, count }) => {
            const meta = FOLDER_META[key];
            return (
              <tr key={key} onClick={() => onOpen(key)} className="cursor-pointer hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Folder className="h-5 w-5 fill-amber-400/25 text-amber-500" />
                    <span className="font-medium">{meta.title}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{meta.hint}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{count}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FolderContents({ folder, students, viewMode, onBack, showBackButton = true }: { folder: FolderKey; students: StudentRow[]; viewMode: ViewMode; onBack: () => void; showBackButton?: boolean }) {
  const meta = FOLDER_META[folder];
  const Icon = meta.icon;

  const getCount = (s: StudentRow) =>
    folder === "contracts" ? s.contracts_count
    : folder === "passports" ? s.documents.passport
    : folder === "snils" ? s.documents.snils
    : folder === "exams" ? s.test_attempts_count : 0;

  return (
    <Card className="rounded-2xl border-border overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">{meta.title}</h2>
        </div>
        {showBackButton && (
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 rounded-xl">
            <ArrowLeft className="w-4 h-4" /> К папкам
          </Button>
        )}
      </div>

      {folder === "docs" ? (
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Единая система документов группы. Все документы связаны с группой и её учениками — данные переиспользуются
            для журналов и выгрузки в ФИС ФРДО.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {getGroupDocumentTypes("docs").map(t => (
              <div key={t.key} className="p-3 rounded-xl border border-border bg-card flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{t.title}</span>
                    <Badge variant={t.status === "ready" ? "default" : t.status === "beta" ? "secondary" : "outline"} className="rounded-full text-[10px]">
                      {t.status === "ready" ? "Доступно" : t.status === "beta" ? "Beta" : "Скоро"}
                    </Badge>
                  </div>
                  {t.hint && <div className="mt-0.5 text-xs text-muted-foreground">{t.hint}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : students.length === 0 ? (

        <div className="p-8 text-center text-sm text-muted-foreground">В группе ещё нет учеников.</div>
      ) : viewMode === "grid" ? (
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {students.map(s => {
            const count = getCount(s);
            return (
              <div key={s.user_id} className="p-3 rounded-xl border border-border bg-card hover:shadow-sm transition-shadow">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                  <Folder className="w-5 h-5" />
                </div>
                <div className="font-medium text-sm truncate">{s.full_name}</div>
                <div className="text-xs text-muted-foreground truncate">{s.email || s.login || "—"}</div>
                <Badge variant={count > 0 ? "default" : "outline"} className="mt-2 rounded-full text-xs">
                  {count > 0 ? `${count} шт.` : "нет"}
                </Badge>
              </div>
            );
          })}
        </div>
      ) : viewMode === "list" ? (
        <div className="divide-y divide-border">
          {students.map(s => {
            const count = getCount(s);
            return (
              <div key={s.user_id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.email || s.login || "—"}</div>
                </div>
                <Badge variant={count > 0 ? "default" : "outline"} className="rounded-full shrink-0">
                  {count > 0 ? `${count} шт.` : "нет"}
                </Badge>
              </div>
            );
          })}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">ФИО</th>
              <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Email / Логин</th>
              <th className="text-right px-4 py-2 font-medium">Файлов</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {students.map(s => {
              const count = getCount(s);
              return (
                <tr key={s.user_id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-medium">{s.full_name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">{s.email || s.login || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
