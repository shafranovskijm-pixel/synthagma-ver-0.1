import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import {
  renderTemplate,
  extractVariables,
  buildOrgVariables,
  buildCompanyVariables,
  formatRussianDate,
  formatMoney,
  moneyToWords,
  wrapAsPrintableDocument,
  findMissingVariables,
  buildStudentsTable,
  buildProgramsTable,
  type TemplateVariables,
} from "@/lib/templateRenderer";
import { toast } from "sonner";
import { FileSignature, AlertTriangle, Building2, User, BookOpen, Hash } from "lucide-react";
import { TrainingPlanEditor } from "./TrainingPlanEditor";

interface Student { user_id: string; full_name: string; email?: string | null; }
interface Template { id: string; name: string; body_html: string; }
interface Company {
  id: string; name: string;
  inn: string | null; kpp: string | null; ogrn: string | null;
  address: string | null; director: string | null;
}
interface Course { id: string; title: string; duration: string | null; }
interface TrainingPlan { title: string | null; hours: number | null; form: string | null; plan_html: string | null; }

interface Props {
  organizationId: string;
  groupId: string;
  groupName: string;
  students: Student[];
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

type CounterpartyType = "individual" | "legal";
type NumberMode = "auto" | "manual" | "none";

const RAW_KEYS = new Set(["students_table", "programs_table", "training_plan"]);

export function GenerateContractDialog({ organizationId, groupId, groupName, students, open, onClose, onGenerated }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orgReq, setOrgReq] = useState<any>(null);
  const [courses, setCourses] = useState<Course[]>([]);

  const [counterparty, setCounterparty] = useState<CounterpartyType>("individual");
  const [templateId, setTemplateId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>(""); // for single-student "individual" mode
  const [multiStudentIds, setMultiStudentIds] = useState<string[]>([]); // for students_table
  const [companyId, setCompanyId] = useState<string>("");

  const [numberMode, setNumberMode] = useState<NumberMode>("auto");
  const [numberPrefix, setNumberPrefix] = useState<string>("");
  const [numberManual, setNumberManual] = useState<string>("");
  const [previewNumber, setPreviewNumber] = useState<string>(""); // computed display

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState<string>("");

  const [courseId, setCourseId] = useState<string>("");
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [courseHoursOverride, setCourseHoursOverride] = useState<string>("");
  const [courseFormOverride, setCourseFormOverride] = useState<string>("");

  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [tplRes, coRes, orgRes, crsRes] = await Promise.all([
        (supabase as any).from("org_contract_templates").select("id, name, body_html").eq("organization_id", organizationId).order("name"),
        (supabase as any).from("companies").select("id, name, inn, kpp, ogrn, address, director").eq("organization_id", organizationId).order("name"),
        (supabase as any).from("organizations").select("name, inn, kpp, ogrn, legal_address, director_name, director_position, bank_name, bank_bik, bank_account, bank_corr_account").eq("id", organizationId).maybeSingle(),
        (supabase as any).from("courses").select("id, title, duration").eq("organization_id", organizationId).order("title"),
      ]);
      setTemplates((tplRes.data || []) as Template[]);
      setCompanies((coRes.data || []) as Company[]);
      setOrgReq(orgRes.data || null);
      setCourses((crsRes.data || []) as Course[]);
    })();
  }, [open, organizationId]);

  // Load training plan for selected course
  useEffect(() => {
    if (!courseId) { setPlan(null); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from("program_training_plans")
        .select("title, hours, form, plan_html")
        .eq("course_id", courseId)
        .maybeSingle();
      setPlan((data as TrainingPlan) || null);
      setCourseHoursOverride(data?.hours != null ? String(data.hours) : "");
      setCourseFormOverride(data?.form || "");
    })();
  }, [courseId]);

  // Compute preview number for display
  useEffect(() => {
    if (numberMode === "none") { setPreviewNumber(""); return; }
    if (numberMode === "manual") { setPreviewNumber(numberManual); return; }
    // Auto: show "<prefix>NNN" placeholder
    setPreviewNumber(`${numberPrefix || ""}__auto__`);
  }, [numberMode, numberPrefix, numberManual]);

  const selectedTpl = templates.find(t => t.id === templateId);
  const selectedStudent = students.find(s => s.user_id === studentId);
  const selectedCompany = companies.find(c => c.id === companyId);
  const selectedCourse = courses.find(c => c.id === courseId);

  const selectedStudentRows = useMemo(() => {
    const ids = multiStudentIds.length ? multiStudentIds : (selectedStudent ? [selectedStudent.user_id] : []);
    return students.filter(s => ids.includes(s.user_id)).map(s => ({
      full_name: s.full_name,
      email: s.email,
      program: plan?.title || selectedCourse?.title || "",
    }));
  }, [multiStudentIds, selectedStudent, students, plan, selectedCourse]);

  const programHours = courseHoursOverride || (plan?.hours != null ? String(plan.hours) : "") || (selectedCourse?.duration || "");
  const programForm = courseFormOverride || plan?.form || "";
  const programTitle = plan?.title || selectedCourse?.title || "";

  const buildVariables = (numberValue: string): TemplateVariables => {
    const base: TemplateVariables = {
      ...(orgReq ? buildOrgVariables(orgReq) : {}),
      contract_number: numberValue,
      contract_date: date ? formatRussianDate(date) : "",
      group_name: groupName,
      course_title: programTitle,
      course_hours: programHours,
      course_duration: programHours ? ` продолжительностью ${programHours} часов` : "",
      program_title: programTitle,
      program_hours: programHours,
      program_form: programForm,
      total_price: price ? formatMoney(Number(price)) : "",
      total_price_words: price ? moneyToWords(Number(price)) : "",
      price: price ? formatMoney(Number(price)) : "",
      students_count: selectedStudentRows.length || (counterparty === "individual" && selectedStudent ? 1 : 0),
      students_table: buildStudentsTable(selectedStudentRows),
      programs_table: buildProgramsTable(programTitle ? [{ title: programTitle, hours: programHours ? Number(programHours) : null, form: programForm, count: selectedStudentRows.length || null }] : []),
      training_plan: plan?.plan_html || "",
    };
    if (counterparty === "individual" && selectedStudent) {
      base.individual_name = selectedStudent.full_name;
      base.individual_email = selectedStudent.email || "";
    }
    if (counterparty === "legal" && selectedCompany) {
      Object.assign(base, buildCompanyVariables(selectedCompany));
    }
    return { ...base, ...extra };
  };

  const previewVariables = useMemo(() => buildVariables(previewNumber || ""), [previewNumber, orgReq, date, groupName, programTitle, programHours, programForm, price, counterparty, selectedStudent, selectedCompany, selectedStudentRows, plan, extra]);

  const previewHtml = useMemo(() => {
    if (!selectedTpl) return "";
    return renderTemplate(selectedTpl.body_html, previewVariables, RAW_KEYS);
  }, [selectedTpl, previewVariables]);

  const missing = useMemo(() => {
    if (!selectedTpl) return [] as string[];
    return findMissingVariables(selectedTpl.body_html, previewVariables);
  }, [selectedTpl, previewVariables]);

  const allTplVars = useMemo(() => selectedTpl ? extractVariables(selectedTpl.body_html) : [], [selectedTpl]);
  const knownKeys = new Set([
    "org_name","org_inn","org_kpp","org_ogrn","org_address","org_director_name","org_director_position","org_director_acting",
    "org_bank_name","org_bank_bik","org_bank_account","org_bank_corr_account","org_email","org_phone",
    "company_name","company_inn","company_kpp","company_ogrn","company_address","company_director",
    "individual_name","individual_email","individual_passport","individual_address","individual_phone",
    "contract_number","contract_date","group_name","course_title","course_hours","course_duration",
    "total_price","total_price_words","price","students_count",
    "program_title","program_hours","program_form","students_table","programs_table","training_plan",
  ]);
  const customVars = allTplVars.filter(k => !knownKeys.has(k));

  const toggleMultiStudent = (id: string) => {
    setMultiStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const resolveNumber = async (): Promise<string> => {
    if (numberMode === "none") return "";
    if (numberMode === "manual") return numberManual.trim();
    // auto
    try {
      const year = new Date(date || Date.now()).getFullYear();
      const { data, error } = await (supabase as any).rpc("get_next_document_number", {
        p_org: organizationId, p_doc_type: "contract", p_year: year,
      });
      if (error) throw error;
      const seq = String(data).padStart(3, "0");
      return `${numberPrefix || ""}${year}-${seq}`;
    } catch (e: any) {
      toast.error("Не удалось получить авто-номер", { description: e?.message });
      throw e;
    }
  };

  const generate = async () => {
    if (!selectedTpl) { toast.error("Выберите шаблон"); return; }
    if (counterparty === "individual" && !studentId && multiStudentIds.length === 0) { toast.error("Выберите ученика"); return; }
    if (counterparty === "legal" && !companyId) { toast.error("Выберите компанию"); return; }

    setBusy(true);
    try {
      const number = await resolveNumber();
      const vars = buildVariables(number);
      const bodyHtml = renderTemplate(selectedTpl.body_html, vars, RAW_KEYS);
      const title = number ? `Договор ${number}` : "Договор";
      const fullDoc = wrapAsPrintableDocument(bodyHtml, title);

      const safe = title.replace(/[^\w.\-]+/g, "_").slice(0, 60) || "contract";
      const fileName = `${safe}.pdf`;
      const targetKey = counterparty === "individual" ? (studentId || multiStudentIds[0] || "group") : `company_${companyId}`;
      const storagePath = `${organizationId}/contracts/${groupId}/${targetKey}/${Date.now()}_${fileName}`;

      const { data: pdfRes, error: pdfErr } = await supabase.functions.invoke("html-to-pdf", {
        body: { html: fullDoc, fileName, storagePath },
      });
      if (pdfErr) throw pdfErr;
      if (!pdfRes?.path) throw new Error("PDF не был сохранён");

      const { error: insErr } = await (supabase as any).from("org_contracts").insert({
        organization_id: organizationId,
        student_user_id: counterparty === "individual" ? (studentId || multiStudentIds[0] || null) : null,
        student_group_id: groupId,
        company_id: counterparty === "legal" ? companyId : null,
        counterparty_type: counterparty,
        template_id: templateId,
        variables: vars,
        name: title || selectedTpl.name,
        contract_number: number || null,
        contract_date: date || null,
        file_path: pdfRes.path,
        status: "active",
      });
      if (insErr) throw insErr;

      toast.success("Договор сгенерирован" + (number ? ` (№ ${number})` : ""));
      onGenerated();
      onClose();
    } catch (e: any) {
      toast.error("Ошибка генерации", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-5xl h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 pb-3">
            <DialogTitle className="flex items-center gap-2"><FileSignature className="w-5 h-5 text-primary" />Сгенерировать договор</DialogTitle>
            <DialogDescription>Договор для группы «{groupName}». Выберите тип контрагента, шаблон и заполните переменные.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto px-6 flex-1">
            {/* Left column: form */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Тип контрагента</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setCounterparty("individual")}
                    className={`p-3 rounded-xl border text-left transition-all ${counterparty === "individual" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                    <User className="w-4 h-4 text-primary mb-1" />
                    <div className="text-sm font-medium">Физическое лицо</div>
                    <div className="text-xs text-muted-foreground">Ученик группы</div>
                  </button>
                  <button type="button" onClick={() => setCounterparty("legal")}
                    className={`p-3 rounded-xl border text-left transition-all ${counterparty === "legal" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                    <Building2 className="w-4 h-4 text-primary mb-1" />
                    <div className="text-sm font-medium">Юридическое лицо</div>
                    <div className="text-xs text-muted-foreground">Компания-заказчик</div>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Шаблон договора</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder={templates.length ? "Выберите шаблон" : "Нет шаблонов — загрузите новый"} /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {counterparty === "individual" ? (
                <div className="space-y-1.5">
                  <Label>Ученик (основной)</Label>
                  <Select value={studentId} onValueChange={setStudentId}>
                    <SelectTrigger><SelectValue placeholder="Выберите ученика группы" /></SelectTrigger>
                    <SelectContent>
                      {students.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Компания-заказчик</Label>
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger><SelectValue placeholder={companies.length ? "Выберите компанию" : "Нет компаний в базе"} /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.inn ? ` — ИНН ${c.inn}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Multi-select for students_table */}
              <div className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Список обучающихся в договоре</Label>
                  <span className="text-xs text-muted-foreground">Выбрано: {multiStudentIds.length}</span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                  {students.length === 0 && <div className="text-xs text-muted-foreground">В группе нет учеников</div>}
                  {students.map(s => (
                    <label key={s.user_id} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                      <Checkbox checked={multiStudentIds.includes(s.user_id)} onCheckedChange={() => toggleMultiStudent(s.user_id)} />
                      <span>{s.full_name}</span>
                      {s.email && <span className="text-xs text-muted-foreground">— {s.email}</span>}
                    </label>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  Подставляется в переменную <code>{`{{students_table}}`}</code>.
                </div>
              </div>

              {/* Contract number */}
              <div className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Hash className="w-3.5 h-3.5" />Номер договора
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["auto", "manual", "none"] as NumberMode[]).map(m => (
                    <button key={m} type="button" onClick={() => setNumberMode(m)}
                      className={`text-xs py-1.5 rounded-lg border transition ${numberMode === m ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                      {m === "auto" ? "Авто" : m === "manual" ? "Ручной" : "Без номера"}
                    </button>
                  ))}
                </div>
                {numberMode === "auto" && (
                  <div className="space-y-1">
                    <Input value={numberPrefix} onChange={e => setNumberPrefix(e.target.value)} placeholder="Префикс, напр. ГЛТ-" className="h-8 text-sm" />
                    <div className="text-xs text-muted-foreground">Система сама подставит следующий номер по году, напр. <b>{numberPrefix}{new Date(date).getFullYear()}-001</b>.</div>
                  </div>
                )}
                {numberMode === "manual" && (
                  <Input value={numberManual} onChange={e => setNumberManual(e.target.value)} placeholder="2026-01-001" className="h-8 text-sm" />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Дата</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>

              {/* Program */}
              <div className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />Программа обучения</Label>
                  {courseId && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setPlanOpen(true)}>
                      Учебный план
                      <Badge variant={plan?.plan_html ? "default" : "secondary"} className="ml-1 text-[10px]">
                        {plan?.plan_html ? "задан" : "не задан"}
                      </Badge>
                    </Button>
                  )}
                </div>
                <Select value={courseId} onValueChange={setCourseId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder={courses.length ? "Выберите курс" : "Нет курсов в организации"} /></SelectTrigger>
                  <SelectContent>
                    {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={courseHoursOverride} onChange={e => setCourseHoursOverride(e.target.value)} placeholder="Часов" className="h-8 text-sm" />
                  <Input value={courseFormOverride} onChange={e => setCourseFormOverride(e.target.value)} placeholder="Форма обучения" className="h-8 text-sm" />
                </div>
              </div>

              <div className="space-y-1.5"><Label>Стоимость (руб.)</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="5000" /></div>

              {customVars.length > 0 && (
                <div className="rounded-xl border border-border p-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Дополнительные переменные шаблона</div>
                  {customVars.map(k => (
                    <div key={k} className="grid grid-cols-[minmax(120px,1fr)_2fr] gap-2 items-center">
                      <code className="text-xs px-1.5 py-0.5 rounded bg-muted truncate">{`{{${k}}}`}</code>
                      <Input value={extra[k] || ""} onChange={e => setExtra(prev => ({ ...prev, [k]: e.target.value }))} placeholder="значение" />
                    </div>
                  ))}
                </div>
              )}

              {selectedTpl && missing.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Не заполнено: {missing.slice(0, 8).join(", ")}{missing.length > 8 ? `… и ещё ${missing.length - 8}` : ""}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Right column: preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Предпросмотр</Label>
                {selectedTpl && (
                  <Badge variant="secondary" className="rounded-full text-xs">
                    {allTplVars.length} переменных, {missing.length} пустых
                  </Badge>
                )}
              </div>
              <div className="border border-border rounded-xl bg-white overflow-hidden h-[520px]">
                {selectedTpl ? (
                  <iframe title="preview" className="w-full h-full" srcDoc={wrapAsPrintableDocument(previewHtml, "Предпросмотр")} />
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center px-6">
                    Выберите шаблон, чтобы увидеть предпросмотр договора с подставленными данными.
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 pt-4 border-t border-border">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
            <Button onClick={generate} disabled={busy || !selectedTpl} className="gap-1.5">
              <FileSignature className="w-4 h-4" />{busy ? "Генерация…" : "Сгенерировать и сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {courseId && (
        <TrainingPlanEditor
          open={planOpen}
          onClose={() => setPlanOpen(false)}
          organizationId={organizationId}
          courseId={courseId}
          courseTitle={selectedCourse?.title}
          onSaved={(saved) => setPlan({ title: saved.title, hours: saved.hours, form: saved.form, plan_html: saved.plan_html })}
        />
      )}
    </>
  );
}
