import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  parseExcelOrCsv,
  downloadStudentsTemplate,
  downloadImportResults,
  type ParseResult,
  type ParsedStudentRow,
  type ImportResultRow,
} from "@/utils/studentsExcelImport";

interface Course {
  id: string;
  title: string;
}

interface Company {
  id: string;
  name: string;
  inn: string | null;
}

interface StudentGroup {
  id: string;
  name: string;
}

interface ImportStudentsFormProps {
  organizationId: string | null;
  courses: Course[];
  companies: Company[];
  onSuccess: () => void;
}

const nkey = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е");

export default function ImportStudentsForm({ organizationId, courses, companies, onSuccess }: ImportStudentsFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [autoCreateGroups, setAutoCreateGroups] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [results, setResults] = useState<ImportResultRow[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load student groups for the org (used for name→id matching)
  useEffect(() => {
    if (!organizationId) { setGroups([]); return; }
    let alive = true;
    supabase
      .from("student_groups")
      .select("id,name")
      .eq("organization_id", organizationId)
      .then(({ data }) => { if (alive) setGroups((data as StudentGroup[]) || []); });
    return () => { alive = false; };
  }, [organizationId]);

  const courseByName = useMemo(() => {
    const m = new Map<string, string>();
    courses.forEach(c => m.set(nkey(c.title), c.id));
    return m;
  }, [courses]);

  const groupByName = useMemo(() => {
    const m = new Map<string, string>();
    groups.forEach(g => m.set(nkey(g.name), g.id));
    return m;
  }, [groups]);

  const missingCourses = useMemo(() => {
    if (!parsed) return [] as string[];
    return parsed.uniqueCourses.filter(c => !courseByName.has(nkey(c)));
  }, [parsed, courseByName]);

  const missingGroups = useMemo(() => {
    if (!parsed) return [] as string[];
    return parsed.uniqueGroups.filter(g => !groupByName.has(nkey(g)));
  }, [parsed, groupByName]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResults([]);
    setShowResults(false);
    try {
      const p = await parseExcelOrCsv(f);
      setParsed(p);
      if (p.rows.length === 0) {
        toast.error("Не найдено строк для импорта");
      } else {
        toast.success(`Найдено ${p.rows.length} учеников`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Ошибка чтения файла");
      setParsed(null);
    }
  };

  const resolveGroupId = async (name: string, orgId: string): Promise<string | undefined> => {
    const existing = groupByName.get(nkey(name));
    if (existing) return existing;
    if (!autoCreateGroups) return undefined;
    const { data, error } = await supabase
      .from("student_groups")
      .insert({ name, organization_id: orgId })
      .select("id,name")
      .single();
    if (error || !data) return undefined;
    setGroups(prev => [...prev, { id: data.id, name: data.name }]);
    groupByName.set(nkey(data.name), data.id);
    return data.id;
  };

  const handleImport = async () => {
    if (!parsed || parsed.rows.length === 0) {
      toast.error("Выберите файл с учениками");
      return;
    }
    if (!organizationId) {
      toast.error("Организация не определена");
      return;
    }

    // Dedup within file by email/login (trim + lowercase). Rows without both
    // email and login are NOT deduplicated (homonymy is possible).
    const seenEmail = new Set<string>();
    const seenLogin = new Set<string>();
    const dedupedRows: typeof parsed.rows = [];
    const dupSkipped: ImportResultRow[] = [];
    for (const row of parsed.rows) {
      const emailKey = (row.email || "").trim().toLowerCase();
      const loginKey = (row.login || "").trim().toLowerCase();
      const hasKey = !!(emailKey || loginKey);
      if (hasKey) {
        if ((emailKey && seenEmail.has(emailKey)) || (loginKey && seenLogin.has(loginKey))) {
          dupSkipped.push({
            success: false,
            status: "other_error",
            full_name: row.full_name || `(строка ${row.rowIndex})`,
            login: row.login,
            email: row.email,
            group_name: row.group_name,
            courses_enrolled: 0,
            courses_missing: [],
            error: "Дубликат в файле (email/логин уже встречались выше)",
          });
          continue;
        }
        if (emailKey) seenEmail.add(emailKey);
        if (loginKey) seenLogin.add(loginKey);
      }
      dedupedRows.push(row);
    }
    if (dupSkipped.length > 0) {
      toast.warning(`В файле найдено ${dupSkipped.length} дублей по email/логину — они пропущены`);
    }

    setIsImporting(true);
    setResults([]);
    setProgress({ current: 0, total: dedupedRows.length });

    try {
      // Server-canonical capacity preflight (informational only).
      // Часть строк может быть уже существующими учениками — они не расходуют месячный слот.
      const { data: capRows } = await supabase.rpc(
        "get_organization_student_capacity" as any,
        { p_organization_id: organizationId, p_requested_count: 0 },
      );
      const cap: any = Array.isArray(capRows) ? capRows[0] : capRows;
      if (cap && !cap.is_unlimited && (cap.remaining_students ?? 0) < dedupedRows.length) {
        toast.warning(
          `Осталось ${cap.remaining_students} новых учеников в месяце (${cap.current_students}/${cap.max_students}). ` +
          `Уже существующие лимит не расходуют — импорт продолжится.`,
          { duration: 6000 },
        );
      }

      const out: ImportResultRow[] = [...dupSkipped];

      for (let i = 0; i < dedupedRows.length; i++) {
        const row = dedupedRows[i];
        setProgress({ current: i, total: dedupedRows.length });

        try {
          if (!row.full_name) throw new Error("Пустое ФИО");

          let groupId: string | undefined;
          if (row.group_name) {
            groupId = await resolveGroupId(row.group_name, organizationId);
          }

          const courseIds: string[] = [];
          const missing: string[] = [];
          row.course_titles.forEach(title => {
            const id = courseByName.get(nkey(title));
            if (id) courseIds.push(id); else missing.push(title);
          });
          const fallbackCourse = selectedCourseId || null;
          const firstCourse = courseIds[0] || fallbackCourse;

          const { data, error } = await safeInvoke<any>("register-student", {
            body: {
              email: row.email || undefined,
              full_name: row.full_name,
              organization_id: organizationId,
              course_id: firstCourse,
              company_id: selectedCompanyId || null,
              custom_login: row.login || undefined,
              custom_password: row.password || undefined,
              student_group_id: groupId,
              no_login: !row.email,
            },
          });

          // Classify server response.
          const serverCode: string | undefined = data?.code || (error as any)?.code;
          const serverError: string | undefined = data?.error || (error as any)?.message;

          if (error && !data) throw error;

          if (serverCode === "STUDENT_LIMIT_EXCEEDED") {
            out.push({
              success: false, status: "student_limit_exceeded",
              full_name: row.full_name, login: row.login, email: row.email,
              group_name: row.group_name, courses_enrolled: 0, courses_missing: missing,
              error: serverError || "Достигнут месячный лимит новых учеников",
            });
          } else if (serverCode === "STUDENT_ARCHIVED") {
            out.push({
              success: false, status: "archived",
              full_name: row.full_name, login: row.login, email: row.email,
              group_name: row.group_name, courses_enrolled: 0, courses_missing: missing,
              error: serverError || "Ученик в архиве",
            });
          } else if (serverCode === "PROFILE_IN_OTHER_ORG") {
            out.push({
              success: false, status: "profile_in_other_org",
              full_name: row.full_name, login: row.login, email: row.email,
              group_name: row.group_name, courses_enrolled: 0, courses_missing: missing,
              error: serverError || "Профиль пользователя уже в другой организации",
            });
          } else if (data?.error || (!data?.user_id && !data?.success)) {
            throw new Error(serverError || "Ошибка создания");
          } else {
            const userId: string | undefined = data?.user_id;
            const isExisting = !!data?.is_existing;

            let enrolled = firstCourse ? 1 : 0;
            if (userId && courseIds.length > 1) {
              const extras = courseIds.slice(1).map(cid => ({ user_id: userId, course_id: cid, status: "active" }));
              const { error: eErr } = await supabase.from("enrollments").upsert(extras, { onConflict: "user_id,course_id", ignoreDuplicates: true });
              if (!eErr) enrolled += extras.length;
            }

            out.push({
              success: true,
              status: isExisting ? "existing" : "created",
              full_name: row.full_name,
              login: data?.login || row.login,
              password: data?.password || row.password,
              email: row.email,
              group_name: row.group_name,
              courses_enrolled: enrolled,
              courses_missing: missing,
            });
          }
        } catch (err: any) {
          out.push({
            success: false,
            status: "other_error",
            full_name: row.full_name || `(строка ${row.rowIndex})`,
            login: row.login,
            email: row.email,
            group_name: row.group_name,
            courses_enrolled: 0,
            courses_missing: [],
            error: err?.message || "Ошибка создания",
          });
        }

        setResults([...out]);
      }

      setProgress({ current: dedupedRows.length, total: dedupedRows.length });
      setShowResults(true);
      const ok = out.filter(r => r.success).length;
      const fail = out.length - ok;
      if (fail === 0) toast.success(`Импортировано ${ok} учеников`);
      else if (ok === 0) toast.error(`Ошибка импорта всех ${fail} учеников`);
      else toast.success(`Импортировано ${ok} из ${out.length}`);
    } catch (err: any) {
      console.error("Import error:", err);
      toast.error(getErrorMessage(err));
    } finally {
      setIsImporting(false);
    }
  };

  if (showResults) {
    const ok = results.filter(r => r.success).length;
    const fail = results.length - ok;
    return (
      <div className="space-y-4 py-4">
        <div className="flex items-center gap-4 p-4 bg-secondary/50 rounded-xl">
          <div className="flex items-center gap-2 text-green-500">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">{ok} успешно</span>
          </div>
          {fail > 0 && (
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" />
              <span className="font-medium">{fail} с ошибками</span>
            </div>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto space-y-2">
          {results.map((r, idx) => (
            <div key={idx} className={`p-3 rounded-lg border ${r.success ? "bg-green-500/5 border-green-500/20" : "bg-destructive/5 border-destructive/20"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{r.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.login && <>Логин: <code className="bg-secondary px-1 rounded">{r.login}</code> · </>}
                    {r.group_name && <>Группа: {r.group_name} · </>}
                    Курсов: {r.courses_enrolled}
                    {r.courses_missing.length > 0 && <span className="text-amber-500"> · не найдено: {r.courses_missing.join(", ")}</span>}
                  </div>
                </div>
                {r.success ? (
                  r.password ? (
                    <div className="text-xs text-muted-foreground shrink-0">
                      Пароль: <code className="bg-secondary px-1 rounded">{r.password}</code>
                    </div>
                  ) : null
                ) : (
                  <div className="text-xs text-destructive shrink-0 max-w-[45%] text-right">{r.error}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          {ok > 0 && (
            <Button variant="outline" className="flex-1 rounded-xl gap-2" onClick={() => downloadImportResults(results)}>
              <Download className="w-4 h-4" />
              Скачать результаты (.xlsx)
            </Button>
          )}
          <Button className="flex-1 btn-gradient rounded-xl" onClick={onSuccess}>Готово</Button>
        </div>
      </div>
    );
  }

  const d = parsed?.detectedColumns;

  return (
    <div className="space-y-4 py-4">
      <div className="p-4 bg-secondary/50 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Формат файла (.xlsx, .csv):</p>
            <p>Колонки: <b>Логин, Пароль, Табельный номер, Фамилия, Имя, Отчество, Email, Группа, Курс 1, Курс 2, Курс 3 …</b></p>
            <p>Порядок и регистр не важны. Колонок <b>«Курс»</b> можно добавлять сколько нужно (Курс 1, Курс 2, Курс 3 … Курс N) — все указанные курсы будут назначены ученику.</p>
          </div>
        </div>
        <Button variant="link" className="mt-2 h-auto p-0 text-primary" onClick={downloadStudentsTemplate}>
          <Download className="w-4 h-4 mr-1" />
          Скачать шаблон .xlsx
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Файл со списком учеников *</Label>
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${file ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={handleFileChange} />
          {file ? (
            <div className="flex items-center justify-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-primary" />
              <span className="font-medium">{file.name}</span>
            </div>
          ) : (
            <div>
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Нажмите для выбора или перетащите файл</p>
            </div>
          )}
        </div>
      </div>

      {parsed && d && (
        <div className="space-y-3 p-4 rounded-xl border border-border bg-background/50">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{parsed.rows.length} учеников</Badge>
            <Badge variant="secondary">{parsed.uniqueGroups.length} групп</Badge>
            <Badge variant="secondary">{parsed.uniqueCourses.length} курсов</Badge>
            {d.login && <Badge variant="outline">логин</Badge>}
            {d.password && <Badge variant="outline">пароль</Badge>}
            {d.employee_number && <Badge variant="outline">табельный</Badge>}
            {d.email && <Badge variant="outline">email</Badge>}
            {d.group && <Badge variant="outline">группа</Badge>}
            {d.courses > 0 && <Badge variant="outline">курсов колонок: {d.courses}</Badge>}
          </div>
          {!d.fio && !d.last && (
            <div className="text-xs text-amber-500">Не найдены колонки ФИО или Фамилия — строки без ФИО будут пропущены.</div>
          )}
          {missingCourses.length > 0 && (
            <div className="text-xs text-amber-500">
              Курсы не найдены в организации: {missingCourses.slice(0, 5).join(", ")}
              {missingCourses.length > 5 ? `, ещё ${missingCourses.length - 5}` : ""}. Такие курсы будут пропущены.
            </div>
          )}
          {missingGroups.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox id="auto-groups" checked={autoCreateGroups} onCheckedChange={(v) => setAutoCreateGroups(!!v)} />
              <Label htmlFor="auto-groups" className="text-xs cursor-pointer">
                Создать недостающие группы автоматически ({missingGroups.length})
              </Label>
            </div>
          )}

          <div className="max-h-40 overflow-auto rounded-lg border border-border/60">
            <table className="w-full text-xs">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="text-left p-2">ФИО</th>
                  <th className="text-left p-2">Логин</th>
                  <th className="text-left p-2">Группа</th>
                  <th className="text-left p-2">Курсы</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 10).map((r: ParsedStudentRow, i: number) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="p-2">{r.full_name || <span className="text-destructive">—</span>}</td>
                    <td className="p-2 text-muted-foreground">{r.login || "—"}</td>
                    <td className="p-2 text-muted-foreground">{r.group_name || "—"}</td>
                    <td className="p-2 text-muted-foreground">{r.course_titles.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {companies.length > 0 && (
        <div className="space-y-2">
          <Label>Компания для всех (опционально)</Label>
          <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
            <SelectTrigger className="rounded-xl"><SelectValue placeholder="Выберите компанию" /></SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name} {c.inn ? `(ИНН: ${c.inn})` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>Курс по умолчанию (если не указан в файле)</Label>
        <Select value={selectedCourseId} onValueChange={setSelectedCourseId}>
          <SelectTrigger className="rounded-xl"><SelectValue placeholder="Не назначать" /></SelectTrigger>
          <SelectContent>
            {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Button
        className="w-full btn-gradient rounded-xl gap-2"
        onClick={handleImport}
        disabled={!parsed || parsed.rows.length === 0 || isImporting}
      >
        {isImporting ? (
          <>
            <SigmaSpinner size="sm" />
            Импорт {progress.current}/{progress.total}…
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Импортировать {parsed ? `(${parsed.rows.length})` : ""}
          </>
        )}
      </Button>
    </div>
  );
}
