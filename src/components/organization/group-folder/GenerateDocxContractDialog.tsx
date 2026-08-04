/**
 * Генерация договора с компанией из клиентского Word-шаблона (docx_ooxml).
 * Шаг «Готовность данных» блокирует генерацию до заполнения обязательных полей.
 * PDF здесь не создаётся: сервер возвращает честный статус «PDF недоступен».
 */
import { useEffect, useMemo, useState } from "react";
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
  evaluateDocxReadiness,
  fetchDocxTemplates,
  generateDocxContract,
  isDocxDraftReady,
  type DocxContractDraft,
  type RegistryTemplate,
} from "@/lib/contracts/docxContract";
import { formatMoneyRu, moneyToWordsRu, shortNameRu, formatRussianDateLong, formatDateRangeRu } from "../../../../supabase/functions/_shared/docx-ooxml/money";

interface Student { user_id: string; full_name: string; email?: string | null; }

interface Props {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  groupId: string;
  groupName: string;
  students: Student[];
  onGenerated?: () => void;
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

export function GenerateDocxContractDialog({ open, onClose, organizationId, groupId, groupName, students, onGenerated }: Props) {
  const [templates, setTemplates] = useState<RegistryTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState<string>("");
  const [companies, setCompanies] = useState<Array<Record<string, any>>>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [scalars, setScalars] = useState<Record<string, string>>({});
  const [amount, setAmount] = useState<number>(0);
  const [taxChosen, setTaxChosen] = useState(false);
  const [curricula, setCurricula] = useState<string[]>([]);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const setField = (key: string, value: string) => setScalars((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      try {
        const [tpls, companiesRes, groupRes] = await Promise.all([
          fetchDocxTemplates("legal"),
          supabase.from("companies").select("*").eq("organization_id", organizationId).order("name"),
          supabase.from("student_groups").select("*").eq("id", groupId).maybeSingle(),
        ]);
        setTemplates(tpls);
        setTemplateKey((prev) => prev || tpls[0]?.template_key || "");
        setCompanies((companiesRes.data as any[]) || []);
        const g = groupRes.data as any;
        const today = new Date().toISOString().slice(0, 10);
        const dates = formatDateRangeRu(g?.start_date || "", g?.end_date || "");
        setAmount(Number(g?.default_price) || 0);
        setScalars((prev) => ({
          DOC_NO: g?.group_number || "",
          DOC_DATE: formatRussianDateLong(today),
          SCHEDULE: g?.program_form ? `Форма обучения: ${g.program_form}` : "",
          TRAINING_ADDR: "",
          TAX_CLAUSE: "",
          PAYMENT_CLAUSE: "Оплата производится в течение 5 (пяти) банковских дней с даты выставления счёта.",
          ...prev,
        }));
        setRows(
          students.map((s) => ({
            user_id: s.user_id,
            fio: s.full_name || "",
            edu: "высшее",
            contacts: s.email || "",
            position: "",
            address: "",
            program: "",
          })),
        );
        void dates;
      } catch (e: any) {
        toast.error("Не удалось загрузить данные", { description: e?.message });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, organizationId, groupId]);

  // Реквизиты заказчика подставляем из карточки компании, остальное заполняет пользователь.
  useEffect(() => {
    const c = companies.find((x) => x.id === companyId);
    if (!c) return;
    setScalars((prev) => ({
      ...prev,
      CUST_NAME: prev.CUST_NAME || c.name || "",
      CUST_INN: prev.CUST_INN || c.inn || "",
      CUST_KPP: prev.CUST_KPP || c.kpp || "",
      CUST_OGRN: prev.CUST_OGRN || c.ogrn || "",
      CUST_LEGAL_ADDR: prev.CUST_LEGAL_ADDR || c.address || "",
      CUST_POST_ADDR: prev.CUST_POST_ADDR || c.address || "",
      CUST_EMAIL: prev.CUST_EMAIL || c.email || "",
      CUST_REP_GEN: prev.CUST_REP_GEN || "",
      CUST_REP_SHORT: prev.CUST_REP_SHORT || (c.director ? shortNameRu(c.director) : ""),
      CUST_AUTH: prev.CUST_AUTH || "Уставе",
      CUST_REP_POS: prev.CUST_REP_POS || "Генеральный директор",
    }));
  }, [companyId, companies]);

  const groupDatesText = useMemo(() => scalars.__DATES || "", [scalars]);

  const draft: DocxContractDraft = useMemo(() => {
    const programs = curricula.map((title) => ({
      PROG_TITLE: title,
      PROG_FORM: scalars.PROG_FORM || "Очная",
      PROG_COUNT: String(rows.filter((r) => r.program === title).length),
    }));
    const studentRows = rows.map((r) => ({
      STUDENT_FIO: r.fio,
      STUDENT_EDU: r.edu,
      STUDENT_CONTACTS: r.contacts,
      STUDENT_POSITION: r.position,
      STUDENT_ADDRESS: r.address,
      STUDENT_PROGRAM: r.program,
      STUDENT_DATES: scalars.STUDENT_DATES || groupDatesText,
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
  }, [scalars, rows, curricula, amount, taxChosen, groupDatesText]);

  const readiness = useMemo(() => evaluateDocxReadiness(draft), [draft]);
  const ready = isDocxDraftReady(readiness) && !!companyId && !!templateKey;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      const res = await generateDocxContract({
        templateKey,
        organizationId,
        groupId,
        companyId,
        studentUserIds: rows.map((r) => r.user_id),
        studentsMeta: rows.map((r) => ({ user_id: r.user_id, full_name: r.fio })),
        contractName: `Договор ${scalars.DOC_NO} — ${scalars.CUST_NAME}`,
        contractNumber: scalars.DOC_NO,
        contractDate: new Date().toISOString().slice(0, 10),
        draft,
      });
      toast.success("Договор сформирован (Word)", {
        description: `Приложения: ${res.keptCurricula.length}. PDF пока недоступен — доступен DOCX.`,
      });
      onGenerated?.();
      onClose();
    } catch (e: any) {
      toast.error("Договор не сформирован", { description: e?.message });
    } finally {
      setBusy(false);
    }
  };

  const template = templates.find((t) => t.template_key === templateKey);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
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
                    </div>
                  ))}
                </div>
              </div>

              {/* Договор и обучение */}
              <div className="space-y-2">
                <div className="text-sm font-semibold">Договор, группа и место обучения</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="DOC_NO">Номер договора</Label>
                    <Input id="DOC_NO" value={scalars.DOC_NO || ""} onChange={(e) => setField("DOC_NO", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="DOC_DATE">Дата договора (текстом)</Label>
                    <Input id="DOC_DATE" value={scalars.DOC_DATE || ""} onChange={(e) => setField("DOC_DATE", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="TRAINING_ADDR">Место обучения</Label>
                    <Input id="TRAINING_ADDR" value={scalars.TRAINING_ADDR || ""} onChange={(e) => setField("TRAINING_ADDR", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="SCHEDULE">Режим занятий</Label>
                    <Input id="SCHEDULE" value={scalars.SCHEDULE || ""} onChange={(e) => setField("SCHEDULE", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="STUDENT_DATES">Даты обучения (для всех слушателей)</Label>
                    <Input id="STUDENT_DATES" value={scalars.STUDENT_DATES || ""} onChange={(e) => setField("STUDENT_DATES", e.target.value)} placeholder="03.08.2026 — 07.08.2026" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="PROG_FORM">Форма обучения</Label>
                    <Input id="PROG_FORM" value={scalars.PROG_FORM || "Очная"} onChange={(e) => setField("PROG_FORM", e.target.value)} />
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
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{EDU_LEVELS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`contacts-${i}`}>Контакты</Label>
                        <Input id={`contacts-${i}`} value={r.contacts} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, contacts: e.target.value } : x))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`pos-${i}`}>Должность</Label>
                        <Input id={`pos-${i}`} value={r.position} onChange={(e) => setRows((p) => p.map((x, j) => j === i ? { ...x, position: e.target.value } : x))} />
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
