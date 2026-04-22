import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, Building2, Users, Eye, Download, FileStack, Search, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  renderTemplate,
  buildOrgVariables,
  buildCompanyVariables,
  formatRussianDate,
  formatMoney,
  moneyToWords,
  findMissingVariables,
  wrapAsPrintableDocument,
  type TemplateVariables,
} from "@/lib/templateRenderer";

interface Template {
  id: string;
  name: string;
  body_html: string;
  is_default: boolean;
}

interface Company {
  id: string;
  name: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  address: string | null;
  director: string | null;
}

interface Student {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

interface OrgRequisites {
  name?: string | null;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  legal_address?: string | null;
  director_name?: string | null;
  director_position?: string | null;
  bank_name?: string | null;
  bank_bik?: string | null;
  bank_account?: string | null;
  bank_corr_account?: string | null;
  email?: string | null;
  phone?: string | null;
  stamp_url?: string | null;
  signature_url?: string | null;
}

interface BulkDocumentGeneratorProps {
  organizationId: string;
  isOpen: boolean;
  onClose: () => void;
}

type RecipientType = "companies" | "students";

interface GenerationResult {
  recipientId: string;
  recipientName: string;
  status: "success" | "error";
  documentName?: string;
  error?: string;
}

export function BulkDocumentGenerator({ organizationId, isOpen, onClose }: BulkDocumentGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"setup" | "preview" | "running" | "done">("setup");

  // Шаблоны
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Реквизиты организации
  const [orgRequisites, setOrgRequisites] = useState<OrgRequisites | null>(null);

  // Получатели
  const [recipientType, setRecipientType] = useState<RecipientType>("companies");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  // Параметры документа
  const [documentDate, setDocumentDate] = useState(new Date().toISOString().slice(0, 10));
  const [contractNumberPrefix, setContractNumberPrefix] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-`
  );
  const [contractNumberStart, setContractNumberStart] = useState(1);
  const [perStudentPrice, setPerStudentPrice] = useState<number>(0);
  const [studentsPerCompany, setStudentsPerCompany] = useState<number>(1);

  // Прогресс
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<GenerationResult[]>([]);
  const cancelRef = useRef(false);
  const [duplicateNumbers, setDuplicateNumbers] = useState<string[]>([]);

  const selectedTemplate = useMemo(
    () => templates.find(t => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId]
  );

  useEffect(() => {
    if (!isOpen || !organizationId) return;
    void loadInitialData();
  }, [isOpen, organizationId]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [tplRes, orgRes, compRes, studRes] = await Promise.all([
        supabase
          .from("org_contract_templates")
          .select("id, name, body_html, is_default")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .is("archived_at", null)
          .order("is_default", { ascending: false })
          .order("name"),
        supabase
          .from("organizations")
          .select("name, email, phone, inn, kpp, ogrn, legal_address, director_name, director_position, bank_name, bank_bik, bank_account, bank_corr_account, stamp_url, signature_url")
          .eq("id", organizationId)
          .maybeSingle(),
        supabase
          .from("companies")
          .select("id, name, inn, kpp, ogrn, address, director")
          .eq("organization_id", organizationId)
          .order("name"),
        supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .eq("organization_id", organizationId)
          .order("full_name"),
      ]);

      const tpls = (tplRes.data || []) as Template[];
      setTemplates(tpls);
      if (tpls.length > 0) {
        setSelectedTemplateId(tpls.find(t => t.is_default)?.id || tpls[0].id);
      }

      setOrgRequisites((orgRes.data || {}) as OrgRequisites);

      setCompanies((compRes.data || []) as Company[]);
      setStudents((studRes.data || []) as Student[]);
    } catch (e: any) {
      console.error("BulkDocumentGenerator load error", e);
      toast.error("Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (recipientType === "companies") {
      const list = companies.map(c => ({ id: c.id, name: c.name, sub: c.inn || "" }));
      return q ? list.filter(c => c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)) : list;
    }
    const list = students.map(s => ({ id: s.user_id, name: s.full_name || s.email || "Без имени", sub: s.email || "" }));
    return q ? list.filter(s => s.name.toLowerCase().includes(q) || s.sub.toLowerCase().includes(q)) : list;
  }, [recipientType, companies, students, search]);

  function toggleAll() {
    if (selectedIds.size === filteredRecipients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecipients.map(r => r.id)));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function buildVariables(index: number, recipientId: string): TemplateVariables {
    const orgVars = buildOrgVariables(orgRequisites || {});
    const number = `${contractNumberPrefix}${String(contractNumberStart + index).padStart(3, "0")}`;
    const totalAmount = perStudentPrice * studentsPerCompany;

    const stampImg = orgRequisites?.stamp_url
      ? `<img src="${orgRequisites.stamp_url}" alt="Печать" style="height:120px;display:inline-block;" />`
      : "";
    const signImg = orgRequisites?.signature_url
      ? `<img src="${orgRequisites.signature_url}" alt="Подпись" style="height:60px;display:inline-block;" />`
      : "";

    const baseVars: TemplateVariables = {
      ...orgVars,
      contract_number: number,
      contract_date: formatRussianDate(documentDate),
      contract_valid_until: formatRussianDate(new Date(new Date(documentDate).setFullYear(new Date(documentDate).getFullYear() + 1))),
      students_count: studentsPerCompany,
      price: formatMoney(perStudentPrice),
      total_price: formatMoney(totalAmount),
      total_price_words: moneyToWords(totalAmount),
      org_stamp_html: stampImg,
      org_signature_html: signImg,
    };

    if (recipientType === "companies") {
      const company = companies.find(c => c.id === recipientId);
      if (company) Object.assign(baseVars, buildCompanyVariables(company));
    } else {
      const student = students.find(s => s.user_id === recipientId);
      if (student) {
        baseVars.individual_name = student.full_name || "";
        baseVars.individual_email = student.email || "";
      }
    }

    return baseVars;
  }

  const previewHtml = useMemo(() => {
    if (!selectedTemplate || selectedIds.size === 0) return "";
    const firstId = Array.from(selectedIds)[0];
    return renderTemplate(selectedTemplate.body_html, buildVariables(0, firstId));
  }, [selectedTemplate, selectedIds, recipientType, companies, students, orgRequisites, documentDate, contractNumberPrefix, contractNumberStart, perStudentPrice, studentsPerCompany]);

  const missingVariables = useMemo(() => {
    if (!selectedTemplate || selectedIds.size === 0) return [];
    const firstId = Array.from(selectedIds)[0];
    return findMissingVariables(selectedTemplate.body_html, buildVariables(0, firstId));
  }, [previewHtml]);

  // Заранее подготовим список планируемых номеров и проверим дубли в БД.
  async function checkDuplicates(): Promise<string[]> {
    const ids = Array.from(selectedIds);
    const planned = ids.map((_, i) =>
      `${contractNumberPrefix}${String(contractNumberStart + i).padStart(3, "0")}`
    );
    if (planned.length === 0) return [];
    try {
      const { data } = await supabase
        .from("company_documents")
        .select("contract_number, company_id, companies!inner(organization_id)")
        .in("contract_number", planned)
        .eq("companies.organization_id", organizationId)
        .is("deleted_at", null);
      const used = new Set((data || []).map((r: any) => r.contract_number).filter(Boolean));
      return planned.filter(n => used.has(n));
    } catch (e) {
      console.warn("Duplicate check failed", e);
      return [];
    }
  }

  async function handleStartPreview() {
    const dups = await checkDuplicates();
    setDuplicateNumbers(dups);
    setStep("preview");
  }

  async function handleGenerate() {
    if (!selectedTemplate || selectedIds.size === 0) return;
    cancelRef.current = false;
    setStep("running");
    setProgress(0);
    setResults([]);
    const ids = Array.from(selectedIds);
    const localResults: GenerationResult[] = [];

    for (let i = 0; i < ids.length; i++) {
      if (cancelRef.current) {
        toast.info(`Остановлено. Готово: ${localResults.length} из ${ids.length}`);
        break;
      }
      const id = ids[i];
      const recipient = filteredRecipients.find(r => r.id === id) || { id, name: "—" };
      try {
        const variables = buildVariables(i, id);
        const html = renderTemplate(selectedTemplate.body_html, variables);
        const fullDoc = wrapAsPrintableDocument(html, `${selectedTemplate.name} — ${recipient.name}`);
        const blob = new Blob([fullDoc], { type: "text/html;charset=utf-8" });
        const fileName = `${selectedTemplate.name.replace(/[^\w\u0400-\u04FF\s.-]/g, "_")}_${variables.contract_number}.html`;
        const path = `${organizationId}/bulk/${Date.now()}_${i}_${fileName}`;

        const { error: uploadErr } = await supabase.storage.from("billing-documents").upload(path, blob, {
          contentType: "text/html",
          upsert: false,
        });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabase.storage.from("billing-documents").getPublicUrl(path);

        if (recipientType === "companies") {
          const totalAmount = perStudentPrice * studentsPerCompany;
          await supabase.from("company_documents").insert({
            company_id: id,
            name: `${selectedTemplate.name} № ${variables.contract_number}`,
            type: "contract",
            contract_number: String(variables.contract_number),
            contract_date: documentDate,
            amount: totalAmount,
            students_count: studentsPerCompany,
            file_url: urlData.publicUrl,
            file_path: path,
          });
        } else {
          // Логируем студенческие документы в общий журнал выдачи документов.
          await supabase.from("document_issuance_log").insert({
            organization_id: organizationId,
            user_id: id,
            user_name: recipient.name,
            document_type: "contract",
            document_name: `${selectedTemplate.name} № ${variables.contract_number}`,
            reg_number: String(variables.contract_number),
            file_url: urlData.publicUrl,
            send_method: "bulk_generation",
          });
        }

        localResults.push({
          recipientId: id,
          recipientName: recipient.name,
          status: "success",
          documentName: String(variables.contract_number),
        });
      } catch (e: any) {
        console.error("Bulk gen error for", id, e);
        localResults.push({
          recipientId: id,
          recipientName: recipient.name,
          status: "error",
          error: e?.message || "Ошибка",
        });
      }

      setProgress(Math.round(((i + 1) / ids.length) * 100));
      setResults([...localResults]);
    }

    setStep("done");
    const successful = localResults.filter(r => r.status === "success").length;
    if (successful === ids.length) {
      toast.success(`Сгенерировано документов: ${successful}`);
    } else {
      toast.warning(`Готово: ${successful}/${ids.length}. Ошибок: ${ids.length - successful}`);
    }
  }

  function handleClose() {
    if (step === "running") {
      toast.warning("Дождитесь завершения или нажмите «Остановить»");
      return;
    }
    setStep("setup");
    setProgress(0);
    setResults([]);
    setSelectedIds(new Set());
    setSearch("");
    onClose();
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && handleClose()}>
      <DialogContent className="max-w-5xl rounded-2xl max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <FileStack className="w-5 h-5 text-primary" />
            Массовая генерация документов
          </DialogTitle>
          <DialogDescription>
            Выберите шаблон и список получателей — система создаст документы по одному пакету
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-16"><SigmaSpinner size="lg" /></div>
        ) : (
          <div className="flex-1 overflow-auto px-6 py-4">
            {step === "setup" && (
              <SetupStep
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                setSelectedTemplateId={setSelectedTemplateId}
                recipientType={recipientType}
                setRecipientType={(t) => { setRecipientType(t); setSelectedIds(new Set()); }}
                filteredRecipients={filteredRecipients}
                selectedIds={selectedIds}
                toggleOne={toggleOne}
                toggleAll={toggleAll}
                search={search}
                setSearch={setSearch}
                documentDate={documentDate}
                setDocumentDate={setDocumentDate}
                contractNumberPrefix={contractNumberPrefix}
                setContractNumberPrefix={setContractNumberPrefix}
                contractNumberStart={contractNumberStart}
                setContractNumberStart={setContractNumberStart}
                perStudentPrice={perStudentPrice}
                setPerStudentPrice={setPerStudentPrice}
                studentsPerCompany={studentsPerCompany}
                setStudentsPerCompany={setStudentsPerCompany}
              />
            )}

            {step === "preview" && (
              <div className="space-y-3">
                {duplicateNumbers.length > 0 && (
                  <Alert variant="destructive" className="rounded-xl">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      Найдены дубли номеров ({duplicateNumbers.length}): {duplicateNumbers.slice(0, 5).join(", ")}
                      {duplicateNumbers.length > 5 ? "…" : ""}. Измените префикс или начальный номер, чтобы избежать конфликтов.
                    </AlertDescription>
                  </Alert>
                )}
                {missingVariables.length > 0 && (
                  <Alert variant="destructive" className="rounded-xl">
                    <AlertTriangle className="w-4 h-4" />
                    <AlertDescription>
                      Незаполненные переменные ({missingVariables.length}): {missingVariables.slice(0, 5).join(", ")}
                      {missingVariables.length > 5 ? "…" : ""}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="text-xs text-muted-foreground">
                  Предпросмотр — первый получатель из списка ({selectedIds.size} всего)
                </div>
                <div className="border border-border rounded-xl overflow-hidden bg-white">
                  <iframe
                    srcDoc={wrapAsPrintableDocument(previewHtml, "Предпросмотр")}
                    className="w-full h-[500px]"
                    title="Предпросмотр"
                  />
                </div>
              </div>
            )}

            {step === "running" && (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center">
                  <SigmaSpinner size="lg" />
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  Генерируем документы… {results.length} из {selectedIds.size}
                </div>
                <Progress value={progress} className="h-2" />
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { cancelRef.current = true; }}
                    className="rounded-xl"
                  >
                    Остановить
                  </Button>
                </div>
              </div>
            )}

            {step === "running" && (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center">
                  <SigmaSpinner size="lg" />
                </div>
                <div className="text-center text-sm text-muted-foreground">
                  Генерируем документы… {results.length} из {selectedIds.size}
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            {step === "done" && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <StatCard
                    label="Всего"
                    value={results.length}
                    icon={FileStack}
                    color="text-primary"
                  />
                  <StatCard
                    label="Успешно"
                    value={results.filter(r => r.status === "success").length}
                    icon={CheckCircle2}
                    color="text-emerald-600 dark:text-emerald-400"
                  />
                  <StatCard
                    label="С ошибкой"
                    value={results.filter(r => r.status === "error").length}
                    icon={AlertTriangle}
                    color="text-rose-600 dark:text-rose-400"
                  />
                </div>
                <ScrollArea className="h-[360px] rounded-xl border border-border">
                  <div className="divide-y divide-border">
                    {results.map(r => (
                      <div key={r.recipientId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          {r.status === "success" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          )}
                          <span className="truncate">{r.recipientName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">
                          {r.status === "success" ? `№ ${r.documentName}` : r.error}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}

        {!loading && (
          <div className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 bg-muted/30">
            <div className="text-xs text-muted-foreground">
              {step === "setup" && (
                <>Выбрано получателей: <strong className="text-foreground">{selectedIds.size}</strong></>
              )}
              {step === "preview" && (
                <>Будет создано документов: <strong className="text-foreground">{selectedIds.size}</strong></>
              )}
            </div>
            <div className="flex gap-2">
              {step === "setup" && (
                <>
                  <Button variant="ghost" onClick={handleClose}>Отмена</Button>
                  <Button
                    onClick={handleStartPreview}
                    disabled={!selectedTemplate || selectedIds.size === 0}
                    className="rounded-xl gap-1.5"
                  >
                    <Eye className="w-4 h-4" />
                    Предпросмотр
                  </Button>
                </>
              )}
              {step === "preview" && (
                <>
                  <Button variant="ghost" onClick={() => setStep("setup")}>Назад</Button>
                  <Button onClick={handleGenerate} className="rounded-xl gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    Сгенерировать ({selectedIds.size})
                  </Button>
                </>
              )}
              {step === "done" && (
                <Button onClick={handleClose} className="rounded-xl">Готово</Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="rounded-xl border border-border p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}

interface SetupStepProps {
  templates: Template[];
  selectedTemplateId: string;
  setSelectedTemplateId: (v: string) => void;
  recipientType: RecipientType;
  setRecipientType: (v: RecipientType) => void;
  filteredRecipients: Array<{ id: string; name: string; sub: string }>;
  selectedIds: Set<string>;
  toggleOne: (id: string) => void;
  toggleAll: () => void;
  search: string;
  setSearch: (v: string) => void;
  documentDate: string;
  setDocumentDate: (v: string) => void;
  contractNumberPrefix: string;
  setContractNumberPrefix: (v: string) => void;
  contractNumberStart: number;
  setContractNumberStart: (v: number) => void;
  perStudentPrice: number;
  setPerStudentPrice: (v: number) => void;
  studentsPerCompany: number;
  setStudentsPerCompany: (v: number) => void;
}

function SetupStep(p: SetupStepProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
      {/* Левая колонка: шаблон + параметры */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Шаблон документа</Label>
          <Select value={p.selectedTemplateId} onValueChange={p.setSelectedTemplateId}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Выберите шаблон" />
            </SelectTrigger>
            <SelectContent>
              {p.templates.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">Нет активных шаблонов</div>
              )}
              {p.templates.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <div className="flex items-center gap-2">
                    {t.is_default && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">по умолчанию</Badge>}
                    {t.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Дата документа</Label>
            <Input type="date" value={p.documentDate} onChange={e => p.setDocumentDate(e.target.value)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Префикс номера</Label>
            <Input value={p.contractNumberPrefix} onChange={e => p.setContractNumberPrefix(e.target.value)} placeholder="2026-01-" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Начальный номер</Label>
            <Input type="number" min={1} value={p.contractNumberStart} onChange={e => p.setContractNumberStart(Number(e.target.value) || 1)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Чел. на 1 документ</Label>
            <Input type="number" min={1} value={p.studentsPerCompany} onChange={e => p.setStudentsPerCompany(Number(e.target.value) || 1)} className="rounded-xl" />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs font-medium">Цена за человека (₽)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={p.perStudentPrice === 0 ? "" : p.perStudentPrice}
              onChange={e => p.setPerStudentPrice(Number(e.target.value) || 0)}
              className="rounded-xl"
            />
          </div>
        </div>

        <Alert className="rounded-xl">
          <AlertDescription className="text-xs">
            Номера автоматически инкрементируются: <strong>{p.contractNumberPrefix}{String(p.contractNumberStart).padStart(3, "0")}</strong>, <strong>{p.contractNumberPrefix}{String(p.contractNumberStart + 1).padStart(3, "0")}</strong>…
          </AlertDescription>
        </Alert>
      </div>

      {/* Правая колонка: получатели */}
      <div className="space-y-3">
        <Tabs value={p.recipientType} onValueChange={v => p.setRecipientType(v as RecipientType)}>
          <TabsList className="grid grid-cols-2 w-full rounded-xl">
            <TabsTrigger value="companies" className="rounded-lg gap-1.5">
              <Building2 className="w-3.5 h-3.5" />
              Компании
            </TabsTrigger>
            <TabsTrigger value="students" className="rounded-lg gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Студенты
            </TabsTrigger>
          </TabsList>

          <TabsContent value={p.recipientType} className="mt-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Поиск..."
                value={p.search}
                onChange={e => p.setSearch(e.target.value)}
                className="pl-9 rounded-xl h-9"
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={p.toggleAll}
                className="text-primary hover:underline font-medium"
              >
                {p.selectedIds.size === p.filteredRecipients.length && p.filteredRecipients.length > 0 ? "Снять выбор" : "Выбрать всех"}
              </button>
              <span className="text-muted-foreground">
                {p.selectedIds.size} / {p.filteredRecipients.length}
              </span>
            </div>
            <ScrollArea className="h-[320px] rounded-xl border border-border">
              <div className="divide-y divide-border">
                {p.filteredRecipients.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">Никого не найдено</div>
                )}
                {p.filteredRecipients.map(r => (
                  <label
                    key={r.id}
                    className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/40 cursor-pointer"
                  >
                    <Checkbox
                      checked={p.selectedIds.has(r.id)}
                      onCheckedChange={() => p.toggleOne(r.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{r.name}</div>
                      {r.sub && <div className="text-xs text-muted-foreground truncate">{r.sub}</div>}
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
