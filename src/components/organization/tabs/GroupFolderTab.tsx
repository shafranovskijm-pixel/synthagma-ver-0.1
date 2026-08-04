import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Folder, FileText, IdCard, FileSignature, GraduationCap, Users, Calendar, Download, Sparkles, LayoutGrid, List, Table as TableIcon, Settings, BookOpen, ClipboardList, Shield, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

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
import { resolveUniqueCommonCourseId } from "@/lib/groups/groupSettings";
import { useGroupFolderCounts } from "@/hooks/useGroupFolderCounts";
import { courseDetailsPathForGroup, groupContextPath, studentDetailsPath } from "@/lib/groups/groupContext";
import { frdoReadinessLabel, resolveFrdoReadiness } from "@/lib/frdo/readiness";




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

const FOLDER_META: Record<FolderKey, { title: string; icon: any; hint: string }> = {
  contracts: { title: GROUP_DOCUMENT_TYPE_MAP.contract.title, icon: FileSignature, hint: GROUP_DOCUMENT_TYPE_MAP.contract.hint || "Договоры с учениками группы" },
  passports: { title: "Паспорта", icon: IdCard, hint: "Сканы паспортов учеников" },
  snils: { title: "СНИЛС", icon: IdCard, hint: "Сканы СНИЛС учеников" },
  exams: { title: "Экзамены", icon: GraduationCap, hint: "Попытки и результаты аттестации" },
  docs: { title: "Документы группы", icon: FileText, hint: "Приказы, журналы, ведомости, книга регистрации" },
};


export function GroupFolderTab({ organizationId, groupId }: GroupFolderTabProps) {
  const d = useOrgDashboard();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showMembers, setShowMembers] = useState(false);
  const [loading, setLoading] = useState(true);

  const [group, setGroup] = useState<GroupData | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [orgInfo, setOrgInfo] = useState<any | null>(null);
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
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
    try { window.localStorage.setItem("orgStudentsPanelMode", "groups"); } catch {}
  }, [setSearchParams]);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: groupData } = await supabase
          .from("student_groups")
          .select("id, name, color, start_date, end_date, group_number, program_title, program_hours, program_form, schedule_text, default_price, course_id")
          .eq("id", groupId)
          .maybeSingle();
        if (cancelled) return;
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
          .eq("student_group_id", groupId);

        const userIds = (profiles || []).map((p: any) => p.user_id);

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
            .maybeSingle();
          if (!cancelled) setCourseInfo((courseRow as any) || null);
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
            .select("user_id, document_type")
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
          if (row.document_type === "passport") cur.passport += 1;
          if (row.document_type === "snils") cur.snils += 1;
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
        number: group.group_number || group.name,
        start_date: group.start_date || "",
        end_date: group.end_date || "",
        program_title: group.program_title || courseInfo?.title || "",
        program_hours: group.program_hours || courseInfo?.frdo_duration_hours || courseInfo?.duration || 0,
        // Fail-closed: форма обучения только из настроек группы. Пустое значение
        // честно блокирует договор, вместо подстановки «типовой» формы.
        program_form: group.program_form || "",
        schedule_text: group.schedule_text || null,
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
  }, [group, orgInfo, students, courseInfo]);

  const resolvedProgramTitle = group?.program_title || courseInfo?.title || "";
  const resolvedCourseId = group?.course_id || courseInfo?.id || null;

  const resolvedProgramHours = group?.program_hours || courseInfo?.frdo_duration_hours || courseInfo?.duration || 0;

  /** Критичные поля: без них документы бессмысленны — генерация блокируется. */
  const blockingDocFields = useMemo(() => {
    const missing: string[] = [];
    if (!resolvedProgramTitle) missing.push("название программы (или курс группы)");
    if (!resolvedProgramHours) missing.push("объём часов");
    if (!orgInfo?.inn) missing.push("ИНН учебного центра");
    if (!orgInfo?.director_name) missing.push("руководитель учебного центра");
    // Юридически обязательные поля без «типовых» подстановок.
    if (!orgInfo?.director_position) missing.push("должность руководителя учебного центра");
    if (!group?.program_form) missing.push("форма обучения группы");
    return missing;
  }, [resolvedProgramTitle, resolvedProgramHours, orgInfo, group?.program_form]);

  const missingDocFields = useMemo(() => {
    const missing = [...blockingDocFields];
    if (!group?.group_number) missing.push("номер группы");
    if (!group?.start_date || !group?.end_date) missing.push("даты обучения");
    return missing;
  }, [blockingDocFields, group]);




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

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => backToStudentsGroups()}>Ученики</button>
        <span>/</span>
        <span>Группы</span>
        <span>/</span>
        <span className="text-foreground font-medium">{group.name}</span>
      </div>

      {/* Header */}
      <Card className="p-5 rounded-2xl border-border">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
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
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  {resolvedProgramTitle || courseInfo?.title || "Курс не привязан"}
                  {resolvedProgramHours ? ` · ${resolvedProgramHours} ч.` : ""}
                </span>
              </div>

            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-4 h-4" /> Настройки группы
            </Button>
            <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => {
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
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm min-w-0">
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
              <span className="text-muted-foreground">Курс не привязан к группе</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant={showMembers ? "default" : "outline"} size="sm" className="rounded-xl gap-1.5" onClick={() => setShowMembers(v => !v)}>
              <Users className="w-4 h-4" /> Участники ({students.length})
              {showMembers ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5"
              onClick={() => navigate(groupContextPath("journals", { groupId, courseId: resolvedCourseId }))}>
              <ClipboardList className="w-4 h-4" /> Журналы группы
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5"
              onClick={() => navigate(groupContextPath("frdo", { groupId, courseId: resolvedCourseId }))}>
              <Shield className="w-4 h-4" /> ФИС ФРДО
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={() => setOpenFolder("docs")}>
              <FileText className="w-4 h-4" /> Документы группы
            </Button>
          </div>
        </div>

        {showMembers && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            {students.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">В группе ещё нет учеников.</div>
            ) : (
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
            )}
          </div>
        )}
      </Card>



      {/* Toolbar: view switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {openFolder ? FOLDER_META[openFolder].title : "Все папки"}
        </div>
        <ToggleGroup type="single" value={viewMode} onValueChange={v => v && setViewMode(v as ViewMode)} className="rounded-xl border border-border p-0.5">
          <ToggleGroupItem value="grid" size="sm" className="rounded-lg h-8 w-8 p-0" aria-label="Плитка"><LayoutGrid className="w-4 h-4" /></ToggleGroupItem>
          <ToggleGroupItem value="list" size="sm" className="rounded-lg h-8 w-8 p-0" aria-label="Список"><List className="w-4 h-4" /></ToggleGroupItem>
          <ToggleGroupItem value="table" size="sm" className="rounded-lg h-8 w-8 p-0" aria-label="Таблица"><TableIcon className="w-4 h-4" /></ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Folder grid */}
      {!openFolder ? (
        <FolderList folders={folderCards} viewMode={viewMode} onOpen={setOpenFolder} />
      ) : openFolder === "contracts" ? (
        <ContractsFolder
          organizationId={organizationId}
          groupId={groupId}
          groupName={group?.name || ""}
          students={students.map(s => ({ user_id: s.user_id, full_name: s.full_name, email: s.email }))}
          onDataChanged={refreshCounts}
        />
      ) : openFolder === "docs" ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setOpenFolder(null)} className="gap-1.5 rounded-xl">
            <ArrowLeft className="w-4 h-4" /> К папкам
          </Button>
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

        </div>
      ) : (
        <FolderContents
          folder={openFolder}
          students={students}
          viewMode={viewMode}
          onBack={() => setOpenFolder(null)}
        />
      )}

      <GroupSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        groupId={groupId}
        organizationId={organizationId}
        onUpdated={() => setReloadKey(k => k + 1)}
        onDeleted={() => backToStudentsGroups()}
      />
    </div>
  );
}

function FolderList({ folders, viewMode, onOpen }: { folders: Array<{ key: FolderKey; count: number }>; viewMode: ViewMode; onOpen: (k: FolderKey) => void }) {
  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {folders.map(({ key, count }) => {
          const meta = FOLDER_META[key];
          const Icon = meta.icon;
          return (
            <button
              key={key}
              onClick={() => onOpen(key)}
              className="group text-left p-4 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Icon className="w-6 h-6" />
              </div>
              <div className="font-semibold">{meta.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{meta.hint}</div>
              <div className="mt-2">
                <Badge variant="secondary" className="rounded-full text-xs">{count} файл(ов)</Badge>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <Card className="rounded-2xl border-border overflow-hidden divide-y divide-border">
        {folders.map(({ key, count }) => {
          const meta = FOLDER_META[key];
          const Icon = meta.icon;
          return (
            <button key={key} onClick={() => onOpen(key)} className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{meta.title}</div>
                <div className="text-xs text-muted-foreground truncate">{meta.hint}</div>
              </div>
              <Badge variant="secondary" className="rounded-full text-xs shrink-0">{count}</Badge>
            </button>
          );
        })}
      </Card>
    );
  }

  // table
  return (
    <Card className="rounded-2xl border-border overflow-hidden">
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
            const Icon = meta.icon;
            return (
              <tr key={key} onClick={() => onOpen(key)} className="cursor-pointer hover:bg-muted/40">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
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
    </Card>
  );
}

function FolderContents({ folder, students, viewMode, onBack }: { folder: FolderKey; students: StudentRow[]; viewMode: ViewMode; onBack: () => void }) {
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
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 rounded-xl">
          <ArrowLeft className="w-4 h-4" /> К папкам
        </Button>
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
                    <Badge variant={t.status === "ready" ? "default" : "outline"} className="rounded-full text-[10px]">
                      {t.status === "ready" ? "Доступно" : "Скоро"}
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
