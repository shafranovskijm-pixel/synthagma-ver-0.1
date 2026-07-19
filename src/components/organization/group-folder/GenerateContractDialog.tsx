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
  type TemplateVariables,
} from "@/lib/templateRenderer";
import { toast } from "sonner";
import { FileSignature, Sparkles, AlertTriangle, Building2, User } from "lucide-react";
import { NewTemplateDialog } from "./NewTemplateDialog";

interface Student {
  user_id: string;
  full_name: string;
  email?: string | null;
}

interface Template {
  id: string;
  name: string;
  body_html: string;
}

interface Company {
  id: string; name: string;
  inn: string | null; kpp: string | null; ogrn: string | null;
  address: string | null; director: string | null;
}

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

export function GenerateContractDialog({ organizationId, groupId, groupName, students, open, onClose, onGenerated }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [orgReq, setOrgReq] = useState<any>(null);

  const [counterparty, setCounterparty] = useState<CounterpartyType>("individual");
  const [templateId, setTemplateId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [companyId, setCompanyId] = useState<string>("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState<string>("");
  const [courseTitle, setCourseTitle] = useState<string>("");
  const [courseHours, setCourseHours] = useState<string>("");
  const [extra, setExtra] = useState<Record<string, string>>({});

  const [busy, setBusy] = useState(false);
  const [newTplOpen, setNewTplOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [tplRes, coRes, orgRes] = await Promise.all([
        (supabase as any).from("org_contract_templates").select("id, name, body_html").eq("organization_id", organizationId).order("name"),
        (supabase as any).from("companies").select("id, name, inn, kpp, ogrn, address, director").eq("organization_id", organizationId).order("name"),
        (supabase as any).from("organizations").select("name, inn, kpp, ogrn, legal_address, director_name, director_position, bank_name, bank_bik, bank_account, bank_corr_account").eq("id", organizationId).maybeSingle(),
      ]);
      setTemplates((tplRes.data || []) as Template[]);
      setCompanies((coRes.data || []) as Company[]);
      setOrgReq(orgRes.data || null);
    })();
  }, [open, organizationId]);

  const selectedTpl = templates.find(t => t.id === templateId);
  const selectedStudent = students.find(s => s.user_id === studentId);
  const selectedCompany = companies.find(c => c.id === companyId);

  const variables: TemplateVariables = useMemo(() => {
    const base: TemplateVariables = {
      ...(orgReq ? buildOrgVariables(orgReq) : {}),
      contract_number: number,
      contract_date: date ? formatRussianDate(date) : "",
      group_name: groupName,
      course_title: courseTitle,
      course_hours: courseHours,
      course_duration: courseHours ? ` продолжительностью ${courseHours} часов` : "",
      total_price: price ? formatMoney(Number(price)) : "",
      total_price_words: price ? moneyToWords(Number(price)) : "",
      price: price ? formatMoney(Number(price)) : "",
    };
    if (counterparty === "individual" && selectedStudent) {
      base.individual_name = selectedStudent.full_name;
      base.individual_email = selectedStudent.email || "";
    }
    if (counterparty === "legal" && selectedCompany) {
      Object.assign(base, buildCompanyVariables(selectedCompany));
    }
    return { ...base, ...extra };
  }, [orgReq, number, date, groupName, courseTitle, courseHours, price, counterparty, selectedStudent, selectedCompany, extra]);

  const previewHtml = useMemo(() => {
    if (!selectedTpl) return "";
    return renderTemplate(selectedTpl.body_html, variables);
  }, [selectedTpl, variables]);

  const missing = useMemo(() => {
    if (!selectedTpl) return [] as string[];
    return findMissingVariables(selectedTpl.body_html, variables);
  }, [selectedTpl, variables]);

  const allTplVars = useMemo(() => selectedTpl ? extractVariables(selectedTpl.body_html) : [], [selectedTpl]);
  const knownKeys = new Set([
    "org_name","org_inn","org_kpp","org_ogrn","org_address","org_director_name","org_director_position","org_director_acting",
    "org_bank_name","org_bank_bik","org_bank_account","org_bank_corr_account","org_email","org_phone",
    "company_name","company_inn","company_kpp","company_ogrn","company_address","company_director",
    "individual_name","individual_email","individual_passport","individual_address","individual_phone",
    "contract_number","contract_date","group_name","course_title","course_hours","course_duration",
    "total_price","total_price_words","price","students_count",
  ]);
  const customVars = allTplVars.filter(k => !knownKeys.has(k));

  const generate = async () => {
    if (!selectedTpl) { toast.error("Выберите шаблон"); return; }
    if (counterparty === "individual" && !studentId) { toast.error("Выберите ученика"); return; }
    if (counterparty === "legal" && !companyId) { toast.error("Выберите компанию"); return; }

    setBusy(true);
    try {
      const bodyHtml = renderTemplate(selectedTpl.body_html, variables);
      const title = `Договор ${number || ""}`.trim();
      const fullDoc = wrapAsPrintableDocument(bodyHtml, title);

      const safe = title.replace(/[^\w.\-]+/g, "_").slice(0, 60) || "contract";
      const fileName = `${safe}.pdf`;
      const storagePath = `${organizationId}/contracts/${groupId}/${counterparty === "individual" ? studentId : `company_${companyId}`}/${Date.now()}_${fileName}`;

      const { data: pdfRes, error: pdfErr } = await supabase.functions.invoke("html-to-pdf", {
        body: { html: fullDoc, fileName, storagePath },
      });
      if (pdfErr) throw pdfErr;
      if (!pdfRes?.path) throw new Error("PDF не был сохранён");

      const { error: insErr } = await (supabase as any).from("org_contracts").insert({
        organization_id: organizationId,
        student_user_id: counterparty === "individual" ? studentId : null,
        student_group_id: groupId,
        company_id: counterparty === "legal" ? companyId : null,
        counterparty_type: counterparty,
        template_id: templateId,
        variables,
        name: title || selectedTpl.name,
        contract_number: number || null,
        contract_date: date || null,
        file_path: pdfRes.path,
        status: "active",
      });
      if (insErr) throw insErr;

      toast.success("Договор сгенерирован");
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
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSignature className="w-5 h-5 text-primary" />Сгенерировать договор</DialogTitle>
            <DialogDescription>Договор для группы «{groupName}». Выберите тип контрагента, шаблон и заполните переменные.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pr-1 flex-1">
            {/* Left column: form */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Тип контрагента</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCounterparty("individual")}
                    className={`p-3 rounded-xl border text-left transition-all ${counterparty === "individual" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <User className="w-4 h-4 text-primary mb-1" />
                    <div className="text-sm font-medium">Физическое лицо</div>
                    <div className="text-xs text-muted-foreground">Ученик группы</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCounterparty("legal")}
                    className={`p-3 rounded-xl border text-left transition-all ${counterparty === "legal" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <Building2 className="w-4 h-4 text-primary mb-1" />
                    <div className="text-sm font-medium">Юридическое лицо</div>
                    <div className="text-xs text-muted-foreground">Компания-заказчик</div>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Шаблон договора</Label>
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setNewTplOpen(true)}>
                    <Sparkles className="w-3.5 h-3.5" /> Новый шаблон
                  </Button>
                </div>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder={templates.length ? "Выберите шаблон" : "Нет шаблонов — создайте новый"} /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {counterparty === "individual" ? (
                <div className="space-y-1.5">
                  <Label>Ученик</Label>
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

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label>Номер</Label><Input value={number} onChange={e => setNumber(e.target.value)} placeholder="2026-01-001" /></div>
                <div className="space-y-1.5"><Label>Дата</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label>Название курса</Label><Input value={courseTitle} onChange={e => setCourseTitle(e.target.value)} placeholder="Охрана труда" /></div>
                <div className="space-y-1.5"><Label>Часов</Label><Input type="number" value={courseHours} onChange={e => setCourseHours(e.target.value)} placeholder="40" /></div>
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

          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
            <Button onClick={generate} disabled={busy || !selectedTpl} className="gap-1.5">
              <FileSignature className="w-4 h-4" />{busy ? "Генерация…" : "Сгенерировать и сохранить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewTemplateDialog
        organizationId={organizationId}
        open={newTplOpen}
        onClose={() => setNewTplOpen(false)}
        onCreated={async (id) => {
          const { data } = await (supabase as any).from("org_contract_templates").select("id, name, body_html").eq("organization_id", organizationId).order("name");
          setTemplates((data || []) as Template[]);
          setTemplateId(id);
        }}
      />
    </>
  );
}
