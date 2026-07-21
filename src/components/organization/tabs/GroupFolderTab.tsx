import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Folder, FileText, IdCard, FileSignature, GraduationCap, Users, Calendar, Download, Sparkles, LayoutGrid, List, Table as TableIcon } from "lucide-react";

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
}

interface StudentRow {
  user_id: string;
  full_name: string;
  email: string | null;
  login: string | null;
  documents: {
    passport: number;
    snils: number;
  };
  contracts_count: number;
  test_attempts_count: number;
}

type FolderKey = "contracts" | "passports" | "snils" | "exams" | "docs";

const FOLDER_META: Record<FolderKey, { title: string; icon: any; hint: string }> = {
  contracts: { title: "Договоры", icon: FileSignature, hint: "Договоры с учениками группы" },
  passports: { title: "Паспорта", icon: IdCard, hint: "Сканы паспортов учеников" },
  snils: { title: "СНИЛС", icon: IdCard, hint: "Сканы СНИЛС учеников" },
  exams: { title: "Экзамены", icon: GraduationCap, hint: "Попытки и результаты аттестации" },
  docs: { title: "Документы группы", icon: FileText, hint: "Приказы, протоколы, списки (в разработке)" },
};

export function GroupFolderTab({ organizationId, groupId }: GroupFolderTabProps) {
  const d = useOrgDashboard();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupData | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
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
          .select("id, name, color, start_date, end_date")
          .eq("id", groupId)
          .maybeSingle();
        if (cancelled) return;
        setGroup(groupData as GroupData | null);

        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email, login")
          .eq("organization_id", organizationId)
          .eq("student_group_id", groupId);

        const userIds = (profiles || []).map((p: any) => p.user_id);
        if (userIds.length === 0) {
          if (!cancelled) setStudents([]);
          return;
        }

        const [docsRes, contractsRes, attemptsRes] = await Promise.all([
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

        const rows: StudentRow[] = (profiles || []).map((p: any) => ({
          user_id: p.user_id,
          full_name: p.full_name || "—",
          email: p.email,
          login: p.login,
          documents: docsByUser.get(p.user_id) || { passport: 0, snils: 0 },
          contracts_count: contractsByUser.get(p.user_id) || 0,
          test_attempts_count: attemptsByUser.get(p.user_id) || 0,
        }));
        if (!cancelled) setStudents(rows);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId, groupId]);

  const counts = useMemo(() => {
    let passports = 0, snils = 0, contracts = 0, exams = 0;
    for (const s of students) {
      passports += s.documents.passport;
      snils += s.documents.snils;
      contracts += s.contracts_count;
      exams += s.test_attempts_count;
    }
    return { passports, snils, contracts, exams };
  }, [students]);

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
        <Button variant="ghost" size="sm" onClick={() => d.tabNavigation.setActiveTab("students")} className="gap-1.5 rounded-xl">
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
    { key: "docs", count: 0 },
  ];

  return (
    <div className="space-y-4">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button className="hover:text-foreground" onClick={() => d.tabNavigation.setActiveTab("students")}>Ученики</button>
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
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={generateStudentsListDoc} disabled={students.length === 0}>
              <Download className="w-4 h-4" /> Список обучающихся (.doc)
            </Button>
            <Button variant="ghost" size="sm" className="rounded-xl gap-1.5" onClick={() => d.tabNavigation.setActiveTab("students")}>
              <ArrowLeft className="w-4 h-4" /> Назад
            </Button>
          </div>
        </div>
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
        />
      ) : (
        <FolderContents
          folder={openFolder}
          students={students}
          viewMode={viewMode}
          onBack={() => setOpenFolder(null)}
        />
      )}
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
        <div className="p-8 text-center text-sm text-muted-foreground space-y-2">
          <Sparkles className="w-8 h-8 mx-auto text-primary/60" />
          <p className="font-medium text-foreground">Автогенерация пакета документов группы — в разработке</p>
          <p>Скоро появятся: титульный лист, журнал занятий, расписание, приказы о зачислении/отчислении, протокол аттестации, книга регистрации выдачи документов и пропуски. Пока доступен «Список обучающихся» в шапке группы.</p>
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
