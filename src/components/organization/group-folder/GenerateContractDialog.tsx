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
import { BUILTIN_CONTRACT_TEMPLATES, isBuiltinTemplateId } from "@/lib/contracts/builtinTemplates";
import { findUnresolvedPlaceholders } from "@/lib/contracts/placeholders";
import { toast } from "sonner";
import {
  FileSignature, AlertTriangle, Building2, User, BookOpen, Hash,
  ChevronLeft, ChevronRight, Check, Star, FileText,
} from "lucide-react";
import { TrainingPlanEditor } from "./TrainingPlanEditor";
import { cn } from "@/lib/utils";
import {
  templateMatchesScenario, templateUsableForScenario, pickDefaultTemplate, validateScenario, blockingMissing,
  planContractJobs, templateVariableGaps, type ContractScenario, type ScenarioStudent,
} from "@/lib/contracts/scenarios";
import { canProceedStep, nextStep, prevStep, type WizardState } from "@/lib/contracts/wizardFlow";
import { htmlToDocxBlob, htmlDocsToZipBlob, downloadBlob, sanitizeFileName } from "@/lib/docx/htmlToDocx";

interface Student { user_id: string; full_name: string; email?: string | null; passport?: string | null; address?: string | null; phone?: string | null; }
interface Template { id: string; name: string; body_html: string; is_default?: boolean | null; updated_at?: string | null; counterparty_type?: string | null; version?: number | null; }
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
  /** Вызывается один раз после успешного создания всей партии договоров. */
  onGenerated: (result?: { scenario: ContractScenario; count: number }) => void;
  /**
   * Быстрая генерация: шаблон по умолчанию, все ученики группы,
   * дата — сегодня, номер — авто. Мастер сразу открывается на шаге проверки.
   */
  quick?: boolean;
  /** Предзаполнение из настроек группы: курс, программа, часы, форма, цена, даты. */
  groupDefaults?: {
    courseId?: string | null;
    programTitle?: string | null;
    programHours?: number | string | null;
    programForm?: string | null;
    price?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  };
}



type CounterpartyType = ContractScenario;
type NumberMode = "auto" | "manual" | "none";

const RAW_KEYS = new Set(["students_table", "programs_table", "training_plan"]);

const STEPS = [
  { id: 1, title: "Контрагент", icon: User },
  { id: 2, title: "Шаблон", icon: FileText },
  { id: 3, title: "Стороны", icon: Building2 },
  { id: 4, title: "Программа и цена", icon: BookOpen },
  { id: 5, title: "Номер и проверка", icon: Check },
];

export function GenerateContractDialog({ organizationId, groupId, groupName, students, open, onClose, onGenerated, quick = false, groupDefaults }: Props) {
  const [step, setStep] = useState(1);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orgReq, setOrgReq] = useState<any>(null);
  const [courses, setCourses] = useState<Course[]>([]);

  const [counterparty, setCounterparty] = useState<CounterpartyType>("individual");
  /** Сценарий выбран пользователем явно — без этого дальше не пускаем (в т.ч. в quick-режиме). */
  const [scenarioChosen, setScenarioChosen] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [multiStudentIds, setMultiStudentIds] = useState<string[]>([]);
  const [primaryStudentId, setPrimaryStudentId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");

  const [numberMode, setNumberMode] = useState<NumberMode>("auto");
  const [numberPrefix, setNumberPrefix] = useState<string>("");
  const [numberManual, setNumberManual] = useState<string>("");
  const [previewNumber, setPreviewNumber] = useState<string>("");

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState<string>("");

  const [courseId, setCourseId] = useState<string>("");
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [courseHoursOverride, setCourseHoursOverride] = useState<string>("");
  const [courseFormOverride, setCourseFormOverride] = useState<string>("");
  /** Название программы из настроек группы (приоритетнее курса). */
  const [programTitleOverride, setProgramTitleOverride] = useState<string>("");

  const [studentDetails, setStudentDetails] = useState<Map<string, { passport: string | null; address: string | null; phone: string | null }>>(new Map());
  /** Правки паспорта/адреса/телефона прямо в мастере — попадают в variables snapshot. */
  const [studentOverrides, setStudentOverrides] = useState<Record<string, { passport?: string; address?: string; phone?: string }>>({});
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  // Reset when dialog opens
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setScenarioChosen(false);
    setStudentOverrides({});
    // Предзаполнение из настроек группы
    setCourseId(groupDefaults?.courseId || "");
    setProgramTitleOverride(groupDefaults?.programTitle || "");
    setCourseHoursOverride(groupDefaults?.programHours ? String(groupDefaults.programHours) : "");
    setCourseFormOverride(groupDefaults?.programForm || "");
    setPrice(groupDefaults?.price ? String(groupDefaults.price) : "");
    setDate(groupDefaults?.startDate || new Date().toISOString().slice(0, 10));
    if (quick) {
      setNumberMode("auto");
      setNumberManual("");
    }

    (async () => {
      const [tplRes, coRes, orgRes, crsRes, profRes, frdoRes] = await Promise.all([
        (supabase as any).from("org_contract_templates").select("id, name, body_html, is_default, updated_at, counterparty_type, version").eq("organization_id", organizationId).order("is_default", { ascending: false }).order("name"),
        (supabase as any).from("companies").select("id, name, inn, kpp, ogrn, address, director").eq("organization_id", organizationId).order("name"),
        (supabase as any).from("organizations").select("name, inn, kpp, ogrn, legal_address, email, phone, director_name, director_position, bank_name, bank_bik, bank_account, bank_corr_account").eq("id", organizationId).maybeSingle(),
        (supabase as any).from("courses").select("id, title, duration").eq("organization_id", organizationId).order("title"),
        // В profiles паспорта/адреса нет — только телефон.
        (supabase as any).from("profiles").select("user_id, phone").eq("organization_id", organizationId).eq("student_group_id", groupId),
        // Паспортные данные живут в student_frdo_data (user_id + organization_id).
        (supabase as any).from("student_frdo_data").select("user_id, passport_series, passport_number").eq("organization_id", organizationId),
      ]);

      for (const [label, res] of [
        ["шаблоны договоров", tplRes], ["компании", coRes], ["реквизиты учебного центра", orgRes],
        ["курсы", crsRes], ["профили учеников", profRes], ["паспортные данные (ФРДО)", frdoRes],
      ] as Array<[string, any]>) {
        if (res?.error) {
          console.error(`[GenerateContractDialog] ошибка загрузки: ${label}`, res.error);
          toast.error(`Не удалось загрузить: ${label}`, { description: res.error.message });
        }
      }

      const details = new Map<string, { passport: string | null; address: string | null; phone: string | null }>();
      (profRes?.data || []).forEach((r: any) => {
        details.set(r.user_id, { passport: null, address: null, phone: r.phone || null });
      });
      (frdoRes?.data || []).forEach((r: any) => {
        const passport = [r.passport_series, r.passport_number].filter(Boolean).join(" ") || null;
        const prev = details.get(r.user_id);
        details.set(r.user_id, { passport, address: prev?.address ?? null, phone: prev?.phone ?? null });
      });
      setStudentDetails(details);
      // Встроенные шаблоны доступны всегда — как fallback, если своих ещё нет.
      const tpls = [...((tplRes.data || []) as Template[]), ...(BUILTIN_CONTRACT_TEMPLATES as any as Template[])];
      setTemplates(tpls);
      setCompanies((coRes.data || []) as Company[]);
      setOrgReq(orgRes.data || null);
      setCourses((crsRes.data || []) as Course[]);

    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, quick]);

  /**
   * Быстрая генерация: автозаполнение применяется ТОЛЬКО после явного выбора сценария —
   * все ученики группы, сегодняшняя дата, авто-номер, шаблон по умолчанию сценария.
   */
  const applyQuickDefaults = (scenario: CounterpartyType) => {
    const ids = students.map(s => s.user_id);
    setMultiStudentIds(ids);
    setPrimaryStudentId(ids[0] || "");
    if (scenario === "individual") setCompanyId("");
    setDate(groupDefaults?.startDate || new Date().toISOString().slice(0, 10));
    setNumberMode("auto");
    const usable = templates.filter(t => templateUsableForScenario(t.counterparty_type, extractVariables(t.body_html), scenario));
    const def = pickDefaultTemplate(usable, scenario);
    if (def) setTemplateId(def.id);
    return def;
  };


  useEffect(() => {
    if (!courseId) { setPlan(null); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from("program_training_plans")
        .select("title, hours, form, plan_html")
        .eq("course_id", courseId)
        .maybeSingle();
      setPlan((data as TrainingPlan) || null);
      // Нет учебного плана — не стираем значения из настроек группы
      setCourseHoursOverride(data?.hours != null ? String(data.hours) : (groupDefaults?.programHours ? String(groupDefaults.programHours) : ""));
      setCourseFormOverride(data?.form || groupDefaults?.programForm || "");
    })();
  }, [courseId]);

  useEffect(() => {
    if (numberMode === "none") { setPreviewNumber(""); return; }
    if (numberMode === "manual") { setPreviewNumber(numberManual); return; }
    setPreviewNumber(`${numberPrefix || ""}__auto__`);
  }, [numberMode, numberPrefix, numberManual]);

  // Шаблон пригоден, только если тип совпадает и нет плейсхолдеров чужого сценария.
  const scenarioTemplates = useMemo(
    () => templates.filter(t => templateUsableForScenario(t.counterparty_type, extractVariables(t.body_html), counterparty)),
    [templates, counterparty],
  );

  // При смене сценария договор всегда переключается на подходящий шаблон.
  useEffect(() => {
    if (!templates.length) return;
    if (templateId && scenarioTemplates.some(t => t.id === templateId)) return;
    setTemplateId(pickDefaultTemplate(scenarioTemplates, counterparty)?.id || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counterparty, templates]);


  const selectedTpl = scenarioTemplates.find(t => t.id === templateId);
  const selectedCompany = companies.find(c => c.id === companyId);
  const selectedCourse = courses.find(c => c.id === courseId);

  const primaryStudent = useMemo(() => {
    if (primaryStudentId) return students.find(s => s.user_id === primaryStudentId) || null;
    if (multiStudentIds[0]) return students.find(s => s.user_id === multiStudentIds[0]) || null;
    return null;
  }, [primaryStudentId, multiStudentIds, students]);

  const selectedStudentRows = useMemo(() => {
    const ids = multiStudentIds.length ? multiStudentIds : (primaryStudent ? [primaryStudent.user_id] : []);
    // primary first
    const primary = primaryStudent?.user_id;
    const ordered = [
      ...(primary && ids.includes(primary) ? [primary] : []),
      ...ids.filter(i => i !== primary),
    ];
    return ordered
      .map(id => students.find(s => s.user_id === id))
      .filter(Boolean)
      .map(s => ({
        full_name: s!.full_name,
        email: s!.email,
        program: plan?.title || selectedCourse?.title || "",
      }));
  }, [multiStudentIds, primaryStudent, students, plan, selectedCourse]);

  const programHours = courseHoursOverride || (plan?.hours != null ? String(plan.hours) : "") || (selectedCourse?.duration || "");
  const programForm = courseFormOverride || plan?.form || "";
  const programTitle = programTitleOverride || plan?.title || selectedCourse?.title || "";

  const allTplVars = useMemo(() => selectedTpl ? extractVariables(selectedTpl.body_html) : [], [selectedTpl]);
  const tplVarSet = useMemo(() => new Set(allTplVars), [allTplVars]);
  const programStepNeeded = useMemo(
    () => ["course_title", "course_hours", "course_duration", "program_title", "program_hours", "program_form", "programs_table", "training_plan", "total_price", "total_price_words", "price"].some(k => tplVarSet.has(k)),
    [tplVarSet],
  );

  const buildVariables = (numberValue: string, jobStudents?: ScenarioStudent[]): TemplateVariables => {
    const rows = (jobStudents
      ? jobStudents.map(s => ({ full_name: s.full_name, email: s.email, program: programTitle }))
      : selectedStudentRows);
    const person = jobStudents ? jobStudents[0] : primaryStudent;
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
      students_count: rows.length,
      students_table: buildStudentsTable(rows),
      programs_table: buildProgramsTable(programTitle ? [{ title: programTitle, hours: programHours ? Number(programHours) : null, form: programForm, count: rows.length || null }] : []),
      training_plan: plan?.plan_html || "",
    };
    if (counterparty === "individual" && person) {
      base.individual_name = person.full_name;
      base.individual_email = person.email || "";
      base.individual_passport = (person as any).passport || "";
      base.individual_address = (person as any).address || "";
      base.individual_phone = (person as any).phone || "";
    }
    if (counterparty === "legal" && selectedCompany) {
      Object.assign(base, buildCompanyVariables(selectedCompany));
    }
    return { ...base, ...extra };
  };


  const scenarioStudents = useMemo<ScenarioStudent[]>(() => {
    const ids = multiStudentIds.length ? multiStudentIds : (primaryStudent ? [primaryStudent.user_id] : []);
    return ids
      .map(id => students.find(s => s.user_id === id))
      .filter(Boolean)
      .map(s => {
        const ov = studentOverrides[s!.user_id] || {};
        const det = studentDetails.get(s!.user_id);
        return {
          user_id: s!.user_id,
          full_name: s!.full_name,
          email: s!.email ?? null,
          passport: (ov.passport ?? "").trim() || s!.passport || det?.passport || null,
          address: (ov.address ?? "").trim() || s!.address || det?.address || null,
          phone: (ov.phone ?? "").trim() || s!.phone || det?.phone || null,
        };
      });
  }, [multiStudentIds, primaryStudent, students, studentDetails, studentOverrides]);

  const previewVariables = useMemo(
    () => buildVariables(previewNumber || "", scenarioStudents.length ? scenarioStudents : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewNumber, orgReq, date, groupName, programTitle, programHours, programForm, price, counterparty, scenarioStudents, selectedCompany, selectedStudentRows, plan, extra],
  );

  const previewHtml = useMemo(() => {
    if (!selectedTpl) return "";
    return renderTemplate(selectedTpl.body_html, previewVariables, RAW_KEYS);
  }, [selectedTpl, previewVariables]);

  const scenarioIssues = useMemo(() => validateScenario(counterparty, {
    org: orgReq,
    students: scenarioStudents,
    company: selectedCompany || null,
    programTitle,
    price,
    date,
    templateId,
  }), [counterparty, orgReq, scenarioStudents, selectedCompany, programTitle, price, date, templateId]);

  const blockers = useMemo(() => blockingMissing(scenarioIssues), [scenarioIssues]);
  const warnings = useMemo(() => scenarioIssues.filter(i => !i.blocking), [scenarioIssues]);

  const missing = useMemo(() => {
    if (!selectedTpl) return [] as string[];
    return findMissingVariables(selectedTpl.body_html, previewVariables);
  }, [selectedTpl, previewVariables]);

  /** Нерешённые {{placeholder}} в готовом HTML — жёсткий стоп генерации. */
  const leftoverPlaceholders = useMemo(() => findUnresolvedPlaceholders(previewHtml), [previewHtml]);
  const generateDisabled = !selectedTpl || blockers.length > 0 || leftoverPlaceholders.length > 0;

  /** Переменные выбранного шаблона без значений — показываем явно перед генерацией. */
  const variableGaps = useMemo(
    () => templateVariableGaps(allTplVars, previewVariables as Record<string, unknown>),
    [allTplVars, previewVariables],
  );



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
    setMultiStudentIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      if (!next.includes(primaryStudentId)) setPrimaryStudentId(next[0] || "");
      return next;
    });
  };

  const setDefaultTemplate = async (id: string) => {
    try {
      if (isBuiltinTemplateId(id)) {
        toast.info("Встроенный шаблон нельзя сделать шаблоном по умолчанию", {
          description: "Загрузите свой шаблон, чтобы закрепить его за сценарием",
        });
        return;
      }
      const scope = templates.find(t => t.id === id)?.counterparty_type || "any";
      await (supabase as any).from("org_contract_templates")
        .update({ is_default: false })
        .eq("organization_id", organizationId)
        .eq("counterparty_type", scope);
      await (supabase as any).from("org_contract_templates").update({ is_default: true }).eq("id", id);
      setTemplates(prev => prev.map(t => (t.counterparty_type === scope ? { ...t, is_default: t.id === id } : t)));
      toast.success("Шаблон по умолчанию обновлён");
    } catch (e: any) {
      toast.error("Не удалось обновить", { description: e?.message });
    }
  };

  const resolveNumber = async (index = 0): Promise<string> => {
    if (numberMode === "none") return "";
    if (numberMode === "manual") {
      const base = numberManual.trim();
      // Ручной номер уникален только для одного документа: остальным добавляем суффикс.
      return index === 0 ? base : `${base}-${index + 1}`;
    }
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
    if (blockers.length > 0) {
      toast.error("Заполните обязательные данные", { description: blockers.map(b => b.label).join(", ") });
      return;
    }
    setBusy(true);
    try {
      const jobs = planContractJobs(counterparty, {
        org: orgReq,
        students: scenarioStudents,
        company: selectedCompany || null,
        programTitle,
        price,
        date,
        templateId,
      });

      const produced: Array<{ name: string; html: string }> = [];

      for (const [index, job] of jobs.entries()) {
        const number = await resolveNumber(index);
        const vars = buildVariables(number, job.students);
        const bodyHtml = renderTemplate(selectedTpl.body_html, vars, RAW_KEYS);
        const leftover = findUnresolvedPlaceholders(bodyHtml);
        if (leftover.length > 0) {
          throw new Error(`Не заполнены переменные шаблона: ${leftover.join(", ")}`);
        }
        const title = number ? `Договор № ${number}` : job.label;
        const fullDoc = wrapAsPrintableDocument(bodyHtml, title);

        const safe = `${title} ${counterparty === "individual" ? job.students[0]?.full_name || "" : ""}`.trim();
        const fileName = sanitizeFileName(safe || "contract", "pdf").replace(/[^\w.\-]+/g, "_");
        const storagePath = `${organizationId}/contracts/${groupId}/${job.key}/${Date.now()}_${fileName}`;

        const { data: pdfRes, error: pdfErr } = await supabase.functions.invoke("html-to-pdf", {
          body: { html: fullDoc, fileName, storagePath },
        });
        if (pdfErr) throw pdfErr;
        if (!pdfRes?.path) throw new Error("PDF не был сохранён");

        const { error: insErr } = await (supabase as any).from("org_contracts").insert({
          organization_id: organizationId,
          student_user_id: job.studentUserId,
          student_group_id: groupId,
          company_id: job.companyId,
          counterparty_type: counterparty,
          template_id: isBuiltinTemplateId(templateId) ? null : templateId,
          template_version: selectedTpl.version ?? null,
          variables: vars,
          students: job.students.map(st => ({ user_id: st.user_id, full_name: st.full_name, email: st.email || null })),
          body_html: fullDoc,
          name: counterparty === "individual" ? `${title} — ${job.students[0]?.full_name || ""}`.trim() : title,
          contract_number: number || null,
          contract_date: date || null,
          file_path: pdfRes.path,
          status: "active",
        });
        if (insErr) throw insErr;

        produced.push({ name: counterparty === "individual" ? `${title} ${job.students[0]?.full_name || ""}`.trim() : title, html: fullDoc });
      }

      // Скачиваем редактируемые DOCX: один документ — файл, несколько — ZIP.
      try {
        if (produced.length === 1) {
          const blob = await htmlToDocxBlob(produced[0].html);
          downloadBlob(blob, sanitizeFileName(produced[0].name, "docx"));
        } else if (produced.length > 1) {
          const blob = await htmlDocsToZipBlob(produced);
          downloadBlob(blob, sanitizeFileName(`Договоры ${groupName}`, "zip"));
        }
      } catch (e: any) {
        toast.error("DOCX не сформирован, но договоры сохранены", { description: e?.message });
      }

      toast.success(produced.length === 1 ? "Договор сгенерирован" : `Сгенерировано договоров: ${produced.length}`);
      onGenerated({ scenario: counterparty, count: produced.length });
      onClose();
    } catch (e: any) {
      toast.error("Ошибка генерации", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  // ── Step validation (чистая логика в src/lib/contracts/wizardFlow.ts) ──
  const wizardState: WizardState = {
    step,
    scenarioChosen,
    counterparty,
    hasTemplate: !!selectedTpl,
    hasPrimaryStudent: !!primaryStudent,
    multiStudentCount: multiStudentIds.length,
    hasCompany: !!companyId,
  };
  const canProceed = (s: number) => canProceedStep(s, { ...wizardState, step: s });

  const goNext = () => {
    // Быстрая генерация: только ПОСЛЕ явного выбора сценария автозаполняем и сразу к проверке.
    if (step === 1 && quick) {
      if (!canProceed(1).ok) return;
      const def = applyQuickDefaults(counterparty);
      const quickState: WizardState = {
        ...wizardState,
        hasTemplate: !!def,
        hasPrimaryStudent: students.length > 0,
        multiStudentCount: students.length,
        hasCompany: !!companyId,
      };
      setStep(nextStep(quickState, {
        quick: true,
        programStepNeeded,
        quickDefaultsReady: !!def,
      }));
      return;
    }
    setStep(nextStep(wizardState, { quick, programStepNeeded }));
  };
  const goBack = () => setStep(prevStep(step, programStepNeeded));

  const proceed = canProceed(step);

  return (
    <>
      <Dialog open={open} onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-4xl h-[92vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 pb-3">
            <DialogTitle className="flex items-center gap-2"><FileSignature className="w-5 h-5 text-primary" />{quick ? "Быстрая генерация договора" : "Сгенерировать договор"}</DialogTitle>
            <DialogDescription>
              {quick
                ? `Группа «${groupName}»: шаблон по умолчанию, все ученики (${students.length}), сегодняшняя дата, авто-номер. Проверьте и сохраните.`
                : `Группа «${groupName}». Заполните мастер по шагам.`}
            </DialogDescription>

          </DialogHeader>

          {/* Stepper */}
          <div className="px-6 pb-4">
            <div className="flex items-center gap-1.5">
              {STEPS.map((s, idx) => {
                const isSkipped = s.id === 4 && !programStepNeeded;
                const active = step === s.id;
                const done = step > s.id;
                const clickable = done || active;
                return (
                  <div key={s.id} className="flex items-center flex-1">
                    <button
                      type="button"
                      disabled={!clickable || isSkipped}
                      onClick={() => clickable && !isSkipped && setStep(s.id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap",
                        active && "bg-primary text-primary-foreground",
                        !active && done && "bg-primary/10 text-primary hover:bg-primary/15",
                        !active && !done && "bg-muted text-muted-foreground",
                        isSkipped && "opacity-40 line-through",
                      )}
                    >
                      <span className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[10px]",
                        active ? "bg-primary-foreground/20" : done ? "bg-primary/20" : "bg-background",
                      )}>
                        {done ? <Check className="w-3 h-3" /> : s.id}
                      </span>
                      {s.title}
                    </button>
                    {idx < STEPS.length - 1 && <div className="h-px bg-border flex-1 mx-1" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="overflow-y-auto px-6 flex-1 pb-4">
            {step === 1 && (
              <div className="max-w-xl mx-auto space-y-4 pt-6">
                <Label className="text-base">Кто заказчик по договору?</Label>
                {quick && (
                  <p className="text-xs text-muted-foreground">
                    Быстрая генерация: выберите сценарий — остальные данные (все ученики группы, сегодняшняя дата, авто-номер, шаблон по умолчанию) подставятся автоматически.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => { setCounterparty("individual"); setScenarioChosen(true); }}
                    className={cn(
                      "p-5 rounded-2xl border-2 text-left transition-all",
                      scenarioChosen && counterparty === "individual" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                    )}>
                    <User className="w-6 h-6 text-primary mb-2" />
                    <div className="text-base font-semibold">Физическое лицо</div>
                    <div className="text-xs text-muted-foreground mt-1">Отдельный договор на каждого выбранного ученика</div>
                  </button>
                  <button type="button" onClick={() => { setCounterparty("legal"); setScenarioChosen(true); }}
                    className={cn(
                      "p-5 rounded-2xl border-2 text-left transition-all",
                      scenarioChosen && counterparty === "legal" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                    )}>
                    <Building2 className="w-6 h-6 text-primary mb-2" />
                    <div className="text-base font-semibold">Компания</div>
                    <div className="text-xs text-muted-foreground mt-1">Один договор с заказчиком и списком слушателей в приложении</div>
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3 pt-2">
                <Label>Выберите шаблон договора</Label>
                {scenarioTemplates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                    <FileText className="w-10 h-10 mx-auto text-muted-foreground/60 mb-2" />
                    <div className="text-sm text-muted-foreground mb-3">
                      {templates.length === 0
                        ? "В организации ещё нет шаблонов договоров"
                        : `Нет шаблонов для сценария «${counterparty === "individual" ? "Физическое лицо" : "Компания"}»`}
                    </div>
                    <div className="text-xs text-muted-foreground">Закройте это окно и нажмите «Загрузить шаблон» в папке договоров.</div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {scenarioTemplates.map(t => {
                      const active = t.id === templateId;
                      return (
                        <div key={t.id}
                          className={cn(
                            "rounded-xl border-2 p-3 transition-all cursor-pointer",
                            active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
                          )}
                          onClick={() => setTemplateId(t.id)}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                {t.name}
                                {t.is_default && <Badge variant="secondary" className="text-[10px] rounded-full">по умолчанию</Badge>}
                                <Badge variant="outline" className="text-[10px] rounded-full">
                                  {t.counterparty_type === "individual" ? "физлицо" : t.counterparty_type === "legal" ? "компания" : "универсальный"}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {extractVariables(t.body_html).length} переменных
                              </div>
                            </div>
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                              title={t.is_default ? "Уже по умолчанию" : "Сделать шаблоном по умолчанию"}
                              onClick={(e) => { e.stopPropagation(); if (!t.is_default) setDefaultTemplate(t.id); }}
                            >
                              <Star className={cn("w-4 h-4", t.is_default ? "fill-primary text-primary" : "text-muted-foreground")} />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedTpl && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Предпросмотр шаблона</Label>
                    <div className="border border-border rounded-xl bg-white overflow-hidden h-[280px]">
                      <iframe title="tpl-preview" className="w-full h-full"
                        srcDoc={wrapAsPrintableDocument(selectedTpl.body_html, "Шаблон")} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 pt-2">
                {counterparty === "individual" ? (
                  <div className="space-y-2">
                    <Label>Обучающиеся в договоре</Label>
                    <div className="text-xs text-muted-foreground">
                      Отметьте всех, кого включить. Звездой отметьте «основного» — его данные пойдут в поля <code className="text-[10px]">{`{{individual_name}}`}</code>.
                    </div>
                    <div className="rounded-xl border border-border divide-y divide-border max-h-[380px] overflow-y-auto">
                      {students.length === 0 && (
                        <div className="p-6 text-center text-sm text-muted-foreground">В группе нет учеников</div>
                      )}
                      {students.map(s => {
                        const checked = multiStudentIds.includes(s.user_id);
                        const isPrimary = primaryStudent?.user_id === s.user_id;
                        return (
                          <label key={s.user_id} className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/40">
                            <Checkbox checked={checked} onCheckedChange={() => toggleMultiStudent(s.user_id)} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{s.full_name}</div>
                              {s.email && <div className="text-xs text-muted-foreground truncate">{s.email}</div>}
                            </div>
                            {checked && (
                              <Button
                                type="button" variant="ghost" size="icon" className="h-7 w-7"
                                onClick={(e) => { e.preventDefault(); setPrimaryStudentId(s.user_id); }}
                                title={isPrimary ? "Основной" : "Сделать основным"}
                              >
                                <Star className={cn("w-4 h-4", isPrimary ? "fill-primary text-primary" : "text-muted-foreground")} />
                              </Button>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Выбрано: {multiStudentIds.length || (primaryStudent ? 1 : 0)}. Список идёт в <code>{`{{students_table}}`}</code>.
                    </div>

                    {scenarioStudents.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <Label className="text-xs">Паспорт, адрес и телефон обучающихся</Label>
                        <div className="text-xs text-muted-foreground">
                          Пустые поля можно заполнить прямо здесь — значения сохранятся в договоре.
                        </div>
                        <div className="rounded-xl border border-border divide-y divide-border max-h-[300px] overflow-y-auto">
                          {scenarioStudents.map(s => (
                            <div key={s.user_id} className="p-3 space-y-2">
                              <div className="text-sm font-medium">{s.full_name}</div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <Input
                                  placeholder="Паспорт (серия и номер)"
                                  value={studentOverrides[s.user_id]?.passport ?? s.passport ?? ""}
                                  onChange={e => setStudentOverrides(p => ({ ...p, [s.user_id]: { ...p[s.user_id], passport: e.target.value } }))}
                                />
                                <Input
                                  placeholder="Адрес регистрации"
                                  value={studentOverrides[s.user_id]?.address ?? s.address ?? ""}
                                  onChange={e => setStudentOverrides(p => ({ ...p, [s.user_id]: { ...p[s.user_id], address: e.target.value } }))}
                                />
                                <Input
                                  placeholder="Телефон"
                                  value={studentOverrides[s.user_id]?.phone ?? s.phone ?? ""}
                                  onChange={e => setStudentOverrides(p => ({ ...p, [s.user_id]: { ...p[s.user_id], phone: e.target.value } }))}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Компания-заказчик</Label>
                      <Select value={companyId} onValueChange={setCompanyId}>
                        <SelectTrigger><SelectValue placeholder={companies.length ? "Выберите компанию" : "Нет компаний в базе"} /></SelectTrigger>
                        <SelectContent>
                          {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.inn ? ` — ИНН ${c.inn}` : ""}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Обучающиеся сотрудники (для {`{{students_table}}`})</Label>
                      <div className="rounded-xl border border-border divide-y divide-border max-h-[280px] overflow-y-auto">
                        {students.length === 0 && (
                          <div className="p-6 text-center text-sm text-muted-foreground">В группе нет учеников</div>
                        )}
                        {students.map(s => (
                          <label key={s.user_id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40">
                            <Checkbox checked={multiStudentIds.includes(s.user_id)} onCheckedChange={() => toggleMultiStudent(s.user_id)} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm truncate">{s.full_name}</div>
                              {s.email && <div className="text-xs text-muted-foreground truncate">{s.email}</div>}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4 pt-2 max-w-2xl">
                <div className="rounded-xl border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" />Программа обучения</Label>
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
                    <SelectTrigger className="h-9"><SelectValue placeholder={courses.length ? "Выберите курс" : "Нет курсов"} /></SelectTrigger>
                    <SelectContent>
                      {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Часов</Label>
                      <Input value={courseHoursOverride} onChange={e => setCourseHoursOverride(e.target.value)} placeholder="40" className="h-9" />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Форма обучения</Label>
                      <Input value={courseFormOverride} onChange={e => setCourseFormOverride(e.target.value)} placeholder="очная / дистанционная" className="h-9" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Стоимость договора (руб.)</Label>
                  <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="5000" />
                  {price && (
                    <div className="text-xs text-muted-foreground">
                      Прописью: {moneyToWords(Number(price))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                <div className="space-y-3">
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
                        <div className="text-xs text-muted-foreground">Например: <b>{numberPrefix}{new Date(date).getFullYear()}-001</b></div>
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

                  {customVars.length > 0 && (
                    <div className="rounded-xl border border-border p-3 space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">Дополнительные переменные шаблона</div>
                      {customVars.map(k => (
                        <div key={k} className="grid grid-cols-[minmax(120px,1fr)_2fr] gap-2 items-center">
                          <code className="text-xs px-1.5 py-0.5 rounded bg-muted truncate">{`{{${k}}}`}</code>
                          <Input value={extra[k] || ""} onChange={e => setExtra(prev => ({ ...prev, [k]: e.target.value }))} placeholder="значение" className="h-8" />
                        </div>
                      ))}
                    </div>
                  )}

                  {variableGaps.length > 0 && (
                    <div className="rounded-xl border border-amber-300/70 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900 p-3 space-y-2">
                      <div className="text-xs font-medium">Незаполненные переменные шаблона ({variableGaps.length})</div>
                      <div className="flex flex-wrap gap-1.5">
                        {variableGaps.map(g => (
                          <span key={g.key} className="text-xs px-2 py-0.5 rounded bg-background border border-border" title={`{{${g.key}}}`}>
                            {g.label}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Банковские и прочие реквизиты подставляются из настроек организации; ученические поля можно заполнить на шаге «Стороны».
                      </div>
                    </div>
                  )}


                  {blockers.length > 0 && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Генерация заблокирована. Заполните: {blockers.map(b => b.label).join(", ")}
                      </AlertDescription>
                    </Alert>
                  )}
                  {warnings.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Договор можно выпустить, но в нём будут пропуски: {warnings.map(b => b.label).join(", ")}
                      </AlertDescription>
                    </Alert>
                  )}
                  {counterparty === "individual" && scenarioStudents.length > 1 && (
                    <Alert>
                      <FileSignature className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Будет создано {scenarioStudents.length} отдельных договоров — по одному на каждого ученика. Скачается ZIP с DOCX.
                      </AlertDescription>
                    </Alert>
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
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Нет шаблона</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-4 border-t border-border flex-row items-center gap-2 sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {!proceed.ok && proceed.reason
                ? proceed.reason
                : step === 5 && blockers.length > 0
                  ? `Не заполнено: ${blockers.map(b => b.label).join(", ")}`
                  : step === 5 && leftoverPlaceholders.length > 0
                    ? `Остались незаполненные переменные: ${leftoverPlaceholders.slice(0, 6).join(", ")}`
                    : `Шаг ${step} из ${STEPS.length}`}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
              {step > 1 && (
                <Button variant="outline" onClick={goBack} disabled={busy} className="gap-1">
                  <ChevronLeft className="w-4 h-4" />Назад
                </Button>
              )}
              {step < 5 ? (
                <Button onClick={goNext} disabled={!proceed.ok} className="gap-1">
                  Далее<ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button onClick={generate} disabled={busy || generateDisabled} className="gap-1.5">
                  <FileSignature className="w-4 h-4" />
                  {busy
                    ? "Генерация…"
                    : counterparty === "individual" && scenarioStudents.length > 1
                      ? `Сгенерировать ${scenarioStudents.length} договора`
                      : "Сгенерировать и сохранить"}
                </Button>
              )}
            </div>
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
