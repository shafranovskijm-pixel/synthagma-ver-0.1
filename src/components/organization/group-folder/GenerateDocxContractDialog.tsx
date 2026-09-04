/**
 * Генерация договора с компанией из клиентского Word-шаблона (docx_ooxml).
 * Шаг «Готовность данных» блокирует генерацию до заполнения обязательных полей.
 * PDF здесь не создаётся: сервер возвращает честный статус «PDF недоступен».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localDateIso } from "@/lib/date/localDate";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, FileType2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  GORELTECH_CURRICULA,
  applyCompanySelection,
  evaluateDocxReadiness,
  fetchDocxTemplates,
  acquireContractNumber,
  fieldSourceLabel,
  formatContractDateRu,
  groupScheduleHint,
  generateDocxContract,
  groupDatesText,
  initialDocxScalars,
  isDocxDraftReady,
  matchGroupCurriculum,
  studentRowFromSources,
  DOCX_FIELD_SOURCES,
  type DocxContractDraft,
  type RegistryTemplate,
} from "@/lib/contracts/docxContract";
import { formatMoneyRu, moneyToWordsRu } from "../../../../supabase/functions/_shared/docx-ooxml/money";
import { companiesPath, groupFolderPath, studentDetailsPath } from "@/lib/groups/groupContext";
import {
  acquireContractSubmission,
  releaseContractSubmission,
  shouldDismissContractDialog,
} from "@/lib/contracts/dialogLifecycle";
import { useNavigate } from "react-router-dom";


interface Student { user_id: string; full_name: string; email?: string | null; }

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  groupId: string;
  groupName: string;
  students: Student[];
  /**
   * Called only after the server has saved the single company contract.
   * Returning false means the caller could not finish the accompanying
   * group-document package; the saved contract must then be reused on retry.
   */
  onGenerated?: (result: GeneratedDocxContractBatch) =>
    void | boolean | Promise<void | boolean>;
}

export interface GeneratedDocxContractBatch {
  scenario: "legal";
  count: 1;
  contractNumbers: [string];
  contractId: string;
  contractIds: string[];
}

const TAX_CLAUSES = [
  "НДС не облагается на основании пп. 14 п. 2 ст. 149 НК РФ.",
  "НДС не облагается в связи с применением упрощённой системы налогообложения.",
  "В том числе НДС 20%.",
];

const EDU_LEVELS = ["высшее", "среднее профессиональное"];

interface StudentRow {
  user_id: string;
  fio: string;
  edu: string;
  contacts: string;
  position: string;
  address: string;
  program: string;
}

const todayIso = () => localDateIso();

/**
 * Подпись источника значения + реальное действие «где это исправить».
 * Ручная правка честно называется снимком (snapshot) этого договора.
 */
function SourceLink({ to, children, onLeave }: { to: string; children: React.ReactNode; onLeave: (to: string) => void }) {
  return (
    <a
      className="underline hover:text-foreground"
      href={to}
      onClick={(e) => { e.preventDefault(); onLeave(to); }}
    >
      {children}
    </a>
  );
}

function SourceHint({ fieldKey, groupId, companyId, edited, onLeave }: { fieldKey: string; groupId?: string; companyId?: string; edited?: boolean; onLeave: (to: string) => void }) {
  const source = DOCX_FIELD_SOURCES[fieldKey] || "manual";
  const action =
    source === "company"
      ? { text: "Изменить в карточке компании", href: companiesPath(companyId || null) }
      : source === "group"
        ? { text: "Изменить в настройках группы", href: groupId ? groupFolderPath(groupId, null, { settings: true }) : null }
        : null;
  return (
    <p className="text-[11px] text-muted-foreground">
      Источник: {fieldSourceLabel(fieldKey)}
      {action && action.href && (
        <> · <SourceLink to={action.href} onLeave={onLeave}>{action.text}</SourceLink></>
      )}
      {edited && <> · правка сохранится только как снимок (snapshot) этого договора</>}
    </p>
  );
}

export function GenerateDocxContractDialog({ open, onClose, organizationId, groupId, groupName, students, onGenerated }: Props) {
  const submitLock = useRef(false);
  const submissionKeyRef = useRef<string | null>(null);
  const [templates, setTemplates] = useState<RegistryTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState<string>("");
  const [companies, setCompanies] = useState<Array<Record<string, any>>>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [scalars, setScalars] = useState<Record<string, string>>({});
  const [docDateIso, setDocDateIso] = useState<string>(todayIso());
  const [amount, setAmount] = useState<number>(0);
  const [taxChosen, setTaxChosen] = useState(false);
  const [curricula, setCurricula] = useState<string[]>([]);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Номер договора, полученный автонумерацией. Хранится, чтобы retry не брал новый номер. */
  const [assignedNumber, setAssignedNumber] = useState<string>("");
  const [scheduleHint, setScheduleHint] = useState<string>("");
  const [curriculumMatched, setCurriculumMatched] = useState<boolean>(false);
  const [manualKeys, setManualKeys] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  /**
   * SPA-переход к источнику истины: диалог закрывается, полный reload страницы
   * не выполняется (черновик мастера не теряется из-за перезагрузки приложения).
   */
  const goToSource = useCallback((to: string) => {
    if (busy || submitLock.current) return;
    onClose();
    navigate(to);
  }, [busy, navigate, onClose]);

  const setField = (key: string, value: string) =>
    setScalars((prev) => {
      setManualKeys((m) => (m.has(key) ? m : new Set(m).add(key)));
      return { ...prev, [key]: value };
    });

  // Каждое открытие диалога начинается с чистого состояния: данные предыдущего
  // договора (компания, реквизиты, приложения, слушатели) не переносятся.
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setCompanyId("");
    setCurricula([]);
    setTaxChosen(false);
    setAmount(0);
    setRows([]);
    setAssignedNumber("");
    submissionKeyRef.current = null;
    setManualKeys(new Set());
    setCurriculumMatched(false);
    setScheduleHint("");
    const iso = todayIso();
    setDocDateIso(iso);
    setScalars(initialDocxScalars(null, iso));

    (async () => {
      try {
        const [tpls, companiesRes, groupRes, profilesRes, frdoRes] = await Promise.all([
          fetchDocxTemplates("legal"),
          supabase.from("companies").select("*").eq("organization_id", organizationId).order("name"),
          supabase.from("student_groups").select("*").eq("id", groupId).maybeSingle(),
          supabase
            .from("profiles")
            .select("user_id, full_name, email, contact_email, phone, city, region, job_position")
            .eq("organization_id", organizationId)
            .eq("student_group_id", groupId)
            .is("archived_at", null),
          supabase
            .from("student_frdo_data")
            .select("user_id, education_level, last_name, first_name, middle_name")
            .eq("organization_id", organizationId),
        ]);
        setTemplates(tpls);
        setTemplateKey(tpls[0]?.template_key || "");

        const g = (groupRes.data as any) || null;
        setAmount(Number(g?.default_price) || 0);
        setScalars(initialDocxScalars(g, iso));
        setCompanies((companiesRes.data as any[]) || []);
        setScheduleHint(groupScheduleHint(g));

        // Название курса группы — второй допустимый источник точного совпадения.
        let courseTitle: string | null = null;
        if (g?.course_id) {
          const { data: courseRow } = await supabase
            .from("courses")
            .select("title")
            .eq("id", g.course_id)
            .maybeSingle();
          courseTitle = (courseRow as any)?.title || null;
        }

        // Учебный план подставляется только при точном совпадении названия.
        const matched = matchGroupCurriculum(g?.program_title, courseTitle);
        setCurriculumMatched(!!matched);
        if (matched) setCurricula([matched]);

        const byUser = new Map<string, any>(((profilesRes.data as any[]) || []).map((p) => [p.user_id, p]));
        const frdoByUser = new Map<string, any>(((frdoRes.data as any[]) || []).map((f) => [f.user_id, f]));
        setRows(
          students.map((s) =>
            studentRowFromSources({
              user_id: s.user_id,
              full_name: s.full_name,
              email: s.email,
              profile: byUser.get(s.user_id) || null,
              frdo: frdoByUser.get(s.user_id) || null,
              program: matched || "",
            }),
          ),
        );
      } catch (e: any) {
        toast.error("Не удалось загрузить данные", { description: e?.message });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, groupId]);


  // Смена компании атомарно заменяет ВСЕ реквизиты заказчика (без «||»),
  // поля договора/группы при этом сохраняются.
  useEffect(() => {
    if (!companyId) return;
    const c = companies.find((x) => x.id === companyId) || null;
    setScalars((prev) => applyCompanySelection(prev, c));
  }, [companyId, companies]);

  // Дата договора: одно ISO-состояние, текст [[DOC_DATE]] выводится из него.
  useEffect(() => {
    setScalars((prev) => ({ ...prev, DOC_DATE: formatContractDateRu(docDateIso) }));
  }, [docDateIso]);

  const draft: DocxContractDraft = useMemo(() => {
    const programs = curricula.map((title) => ({
      PROG_TITLE: title,
      PROG_FORM: scalars.PROG_FORM || "",
      PROG_COUNT: String(rows.filter((r) => r.program === title).length),
    }));
    const studentRows = rows.map((r) => ({
      STUDENT_FIO: r.fio,
      STUDENT_EDU: r.edu,
      STUDENT_CONTACTS: r.contacts,
      STUDENT_POSITION: r.position,
      STUDENT_ADDRESS: r.address,
      STUDENT_PROGRAM: r.program,
      STUDENT_DATES: scalars.STUDENT_DATES || "",
    }));
    return {
      scalars: {
        ...scalars,
        PRICE_NUM: amount > 0 ? formatMoneyRu(amount) : "",
        PRICE_WORDS: amount > 0 ? moneyToWordsRu(amount) : "",
      },
      programs,
      students: studentRows,
      curricula,
      totalAmount: amount,
      taxClauseChosen: taxChosen && !!scalars.TAX_CLAUSE,
    };
  }, [scalars, rows, curricula, amount, taxChosen]);

  const readiness = useMemo(() => evaluateDocxReadiness(draft), [draft]);
  const ready = isDocxDraftReady(readiness) && !!companyId && !!templateKey && !!docDateIso;

  const submit = async () => {
    if (!ready || busy || !acquireContractSubmission(submitLock)) return;
    setBusy(true);
    try {
      // Один номер на весь submit: RPC вызывается максимум один раз,
      // повторная попытка после ошибки компиляции переиспользует его.
      const docNo = await acquireContractNumber(assignedNumber, async () => {
        const { data, error } = await supabase.rpc("get_next_document_number", {
          p_org: organizationId,
          p_doc_type: "contract",
          p_year: Number(docDateIso.slice(0, 4)) || new Date().getFullYear(),
        });
        if (error) throw error;
        return String(data || "");
      });
      if (docNo !== assignedNumber) setAssignedNumber(docNo);

      const finalDraft: DocxContractDraft = {
        ...draft,
        scalars: { ...draft.scalars, DOC_NO: docNo },
      };

      const res = await generateDocxContract({
        submissionKey: submissionKeyRef.current ??= crypto.randomUUID(),
        templateKey,
        organizationId,
        groupId,
        companyId,
        studentUserIds: rows.map((r) => r.user_id),
        studentsMeta: rows.map((r) => ({ user_id: r.user_id, full_name: r.fio })),
        contractName: `Договор ${docNo} — ${scalars.CUST_NAME}`,
        contractNumber: docNo,
        contractDate: docDateIso,
        draft: finalDraft,
      });
      let packageCompleted: void | boolean;
      try {
        packageCompleted = await onGenerated?.({
          scenario: "legal",
          count: 1,
          contractNumbers: [docNo],
          contractId: res.contractId,
          contractIds: [res.contractId],
        });
      } catch (packageError) {
        // The compiler has already persisted the contract. A downstream package
        // error must never make the dialog look safe to submit again.
        console.error("[GenerateDocxContractDialog] group package failed after contract save", packageError);
        packageCompleted = false;
      }
      if (packageCompleted === false) {
        toast.warning("Договор Word сохранён, пакет группы не завершён", {
          description: "Повторите только 9 документов группы — новый договор не нужен.",
        });
      } else {
        toast.success("Договор сформирован (Word)", {
          description: `Приложения: ${res.keptCurricula.length}. PDF пока недоступен — доступен DOCX.`,
        });
      }
      onClose();
    } catch (e: any) {
      toast.error("Договор не сформирован", { description: e?.message });
    } finally {
      releaseContractSubmission(submitLock);
      setBusy(false);
    }
  };

  const template = templates.find((t) => t.template_key === templateKey);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (shouldDismissContractDialog(nextOpen, busy || submitLock.current)) onClose();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileType2 className="w-5 h-5" /> Договор по шаблону клиента (Word)
          </DialogTitle>
          <DialogDescription>
            Группа «{groupName}». Документ собирается из оригинального Word-файла клиента без преобразования в HTML.
            {template && <> Шаблон: {template.name}, версия {template.version_label}, статус {template.status}.</>}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Загрузка данных…
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-3">
            <div className="space-y-6">
              {/* Готовность данных */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Готовность данных</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {readiness.map((g) => (
                    <div key={g.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {g.ready ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <AlertCircle className="w-4 h-4 text-destructive" />}
                        {g.title}
                      </div>
                      {!g.ready && (
                        <ul className="mt-1 text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                          {g.missing.slice(0, 6).map((m) => <li key={m}>{m}</li>)}
                          {g.missing.length > 6 && <li>и ещё {g.missing.length - 6}</li>}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Шаблон и заказчик */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Шаблон договора</Label>
                  <Select value={templateKey} onValueChange={setTemplateKey}>
                    <SelectTrigger><SelectValue placeholder="Выберите шаблон" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.template_key} value={t.template_key}>{t.name} · {t.version_label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Компания-заказчик</Label>
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger><SelectValue placeholder="Выберите компанию" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Реквизиты заказчика */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Заказчик и подписант</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["CUST_NAME", "Полное наименование"],
                    ["CUST_INN", "ИНН"],
                    ["CUST_KPP", "КПП"],
                    ["CUST_OGRN", "ОГРН"],
                    ["CUST_LEGAL_ADDR", "Юридический адрес"],
                    ["CUST_POST_ADDR", "Почтовый адрес"],
                    ["CUST_ACCOUNT", "Расчётный счёт"],
                    ["CUST_BANK", "Банк"],
                    ["CUST_BIK", "БИК"],
                    ["CUST_CORR", "Корр. счёт"],
                    ["CUST_EMAIL", "E-mail"],
                    ["CUST_PHONE", "Телефон"],
                    ["CUST_REP_POS", "Должность подписанта"],
                    ["CUST_REP_GEN", "Подписант (род. падеж)"],
                    ["CUST_REP_SHORT", "Подписант (кратко)"],
                    ["CUST_AUTH", "Действует на основании"],
                  ].map(([key, label]) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={key}>{label}</Label>
                      <Input id={key} value={scalars[key] || ""} onChange={(e) => setField(key, e.target.value)} />
                      <SourceHint fieldKey={key} groupId={groupId} companyId={companyId} edited={manualKeys.has(key)} onLeave={goToSource} />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Значения берутся только из карточки компании: должность подписанта и основание полномочий
                  не подставляются «по умолчанию». Заполните раздел «Реквизиты для документов» в карточке компании,
                  иначе договор нельзя сформировать.
                </p>
              </div>

              {/* Договор и обучение */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Договор, группа и место обучения</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="DOC_NO">Номер договора</Label>
                    <Input
                      id="DOC_NO"
                      value={assignedNumber || "будет назначен автоматически"}
                      readOnly
                      disabled
                    />
                    <SourceHint fieldKey="DOC_NO" groupId={groupId} companyId={companyId} onLeave={goToSource} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="DOC_DATE_ISO">Дата договора</Label>
                    <Input
                      id="DOC_DATE_ISO"
                      type="date"
                      value={docDateIso}
                      onChange={(e) => setDocDateIso(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">В договоре: {scalars.DOC_DATE || "—"}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="TRAINING_ADDR">Место обучения</Label>
                    <Input id="TRAINING_ADDR" value={scalars.TRAINING_ADDR || ""} onChange={(e) => setField("TRAINING_ADDR", e.target.value)} />
                    <SourceHint fieldKey="TRAINING_ADDR" groupId={groupId} companyId={companyId} edited={manualKeys.has("TRAINING_ADDR")} onLeave={goToSource} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="SCHEDULE">Режим занятий</Label>
                    <Input id="SCHEDULE" value={scalars.SCHEDULE || ""} onChange={(e) => setField("SCHEDULE", e.target.value)} />
                    <SourceHint fieldKey="SCHEDULE" groupId={groupId} companyId={companyId} edited={manualKeys.has("SCHEDULE")} onLeave={goToSource} />
                    {scheduleHint && (
                      <p className="text-[11px] text-muted-foreground">
                        Справочно из группы: {scheduleHint}. Это не режим занятий — сформулируйте его в настройках группы.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="STUDENT_DATES">Даты обучения (для всех слушателей)</Label>
                    <Input id="STUDENT_DATES" value={scalars.STUDENT_DATES || ""} onChange={(e) => setField("STUDENT_DATES", e.target.value)} placeholder="03.08.2026 — 07.08.2026" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="PROG_FORM">Форма обучения</Label>
                    <Input id="PROG_FORM" value={scalars.PROG_FORM || ""} onChange={(e) => setField("PROG_FORM", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Оплата */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Стоимость, НДС и оплата</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Стоимость, ₽</Label>
                    <Input id="amount" type="number" min={0} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} />
                    {amount > 0 && <p className="text-xs text-muted-foreground">{moneyToWordsRu(amount)}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Формулировка НДС</Label>
                    <Select
                      value={scalars.TAX_CLAUSE || ""}
                      onValueChange={(v) => { setField("TAX_CLAUSE", v); setTaxChosen(true); }}
                    >
                      <SelectTrigger><SelectValue placeholder="Выберите формулировку" /></SelectTrigger>
                      <SelectContent>
                        {TAX_CLAUSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="PAYMENT_CLAUSE">Порядок оплаты</Label>
                    <Textarea id="PAYMENT_CLAUSE" value={scalars.PAYMENT_CLAUSE || ""} onChange={(e) => setField("PAYMENT_CLAUSE", e.target.value)} rows={2} />
                  </div>
                </div>
              </div>

              {/* Приложения */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Приложения (учебные планы)</div>
                {!curriculumMatched && (
                  <Alert variant="destructive">
                    <AlertCircle className="w-4 h-4" />
                    <AlertTitle>Учебный план не определён автоматически</AlertTitle>
                    <AlertDescription>
                      Название программы группы (или курса) не совпадает точно ни с одним планом шаблона.
                      Выберите план вручную — договор не будет сформирован без выбранного приложения.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  {GORELTECH_CURRICULA.map((title) => (
                    <label key={title} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={curricula.includes(title)}
                        onCheckedChange={(v) =>
                          setCurricula((prev) => (v ? [...prev, title] : prev.filter((t) => t !== title)))
                        }
                        aria-label={title}
                      />
                      <span>{title}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Слушатели */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold">Слушатели</div>
                  <Badge variant="secondary" className="rounded-full">{rows.length}</Badge>
                </div>
                <div className="space-y-3">
                  {rows.map((r, i) => (
                    <div key={r.user_id} className="rounded-xl border border-border p-3 grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor={`fio-${i}`}>ФИО</Label>
                        <Input id={`fio-${i}`} value={r.fio} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, fio: e.target.value } : x))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Образование</Label>
                        <Select value={r.edu} onValueChange={(v) => setRows((p) => p.map((x, j) => j === i ? { ...x, edu: v } : x))}>
                          <SelectTrigger><SelectValue placeholder="Не указано" /></SelectTrigger>
                          <SelectContent>
                            {Array.from(new Set([...EDU_LEVELS, ...(r.edu ? [r.edu] : [])])).map((e) => (
                              <SelectItem key={e} value={e}>{e}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Источник: Данные ФИС ФРДО · <SourceLink to={studentDetailsPath(r.user_id, { groupId, returnToGroupId: groupId })} onLeave={goToSource}>Изменить в карточке ученика</SourceLink>
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`contacts-${i}`}>Контакты</Label>
                        <Input id={`contacts-${i}`} value={r.contacts} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, contacts: e.target.value } : x))} />
                        <p className="text-[11px] text-muted-foreground">
                          Источник: Профиль ученика · <SourceLink to={studentDetailsPath(r.user_id, { groupId, returnToGroupId: groupId })} onLeave={goToSource}>Изменить в карточке ученика</SourceLink>
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`pos-${i}`}>Должность</Label>
                        <Input id={`pos-${i}`} value={r.position} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, position: e.target.value } : x))} />
                        <p className="text-[11px] text-muted-foreground">
                          Источник: Профиль ученика · <SourceLink to={studentDetailsPath(r.user_id, { groupId, returnToGroupId: groupId })} onLeave={goToSource}>Изменить в карточке ученика</SourceLink> · правка здесь — снимок (snapshot) этого договора
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label>Программа</Label>
                        <Select value={r.program} onValueChange={(v) => setRows((p) => p.map((x, j) => j === i ? { ...x, program: v } : x))}>
                          <SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger>
                          <SelectContent>
                            {curricula.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-3">
                        <Label htmlFor={`addr-${i}`}>Адрес проживания (необязательно)</Label>
                        <Input
                          id={`addr-${i}`}
                          value={r.address}
                          placeholder="Регион, город, улица, дом"
                          onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, address: e.target.value } : x))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Alert>
                <AlertCircle className="w-4 h-4" />
                <AlertTitle>PDF пока недоступен</AlertTitle>
                <AlertDescription>
                  Договор выдаётся в формате Word — точно как исходный файл клиента. PDF будет доступен после подключения
                  серверного рендера заполненного DOCX; предпросмотр из HTML для таких договоров не используется.
                </AlertDescription>
              </Alert>
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button onClick={submit} disabled={!ready || busy}>
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Формирование…</> : "Сформировать Word"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
