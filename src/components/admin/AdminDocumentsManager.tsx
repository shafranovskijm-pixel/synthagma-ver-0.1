import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Download, Printer, Eye, Trash2, Plus, Loader2 } from "lucide-react";
import {
  renderAdminDoc,
  ADMIN_DOC_META,
  type AdminDocType,
  type AdminDocVariables,
  type CounterpartyKind,
} from "@/lib/adminDocTemplates";

import { printHtmlContent } from "@/utils/printHtmlToPdf";

interface HistoryRow {
  id: string;
  doc_type: string;
  doc_number: string | null;
  doc_date: string;
  counterparty_name: string;
  counterparty_kind: string;
  status: string;
  html_content: string;
  created_at: string;
}

const emptyVars: AdminDocVariables = {
  doc_number: "",
  doc_date: new Date().toISOString().slice(0, 10),
  counterparty_kind: "legal",
  counterparty_name: "",
};

export interface AdminDocsPrefill {
  counterparty_kind?: CounterpartyKind;
  counterparty_name?: string;
  counterparty_inn?: string;
  counterparty_email?: string;
  counterparty_phone?: string;
  counterparty_signatory?: string;
}

interface AdminDocumentsManagerProps {
  prefill?: AdminDocsPrefill;
  autoLookupDadata?: boolean;
}

export function AdminDocumentsManager({ prefill, autoLookupDadata = true }: AdminDocumentsManagerProps = {}) {
  const initialVars: AdminDocVariables = prefill
    ? { ...emptyVars, ...prefill, counterparty_kind: prefill.counterparty_kind ?? "legal" }
    : emptyVars;
  const [tab, setTab] = useState<"history" | "new">(prefill ? "new" : "history");
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Wizard state
  const [docType, setDocType] = useState<AdminDocType>("paid_contract");
  const [vars, setVars] = useState<AdminDocVariables>(initialVars);
  const [dadataLoading, setDadataLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const meta = ADMIN_DOC_META[docType];

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_generated_documents")
      .select("id, doc_type, doc_number, doc_date, counterparty_name, counterparty_kind, status, html_content, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      toast.error("Не удалось загрузить историю: " + error.message);
    } else {
      setHistory(data as HistoryRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, []);

  // Auto-fetch DaData details when prefill provides an INN
  useEffect(() => {
    if (prefill?.counterparty_inn && autoLookupDadata) {
      lookupDadata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateVar = (k: keyof AdminDocVariables, v: string) =>
    setVars((prev) => ({ ...prev, [k]: v }));

  const lookupDadata = async () => {
    const q = vars.counterparty_inn?.trim();
    if (!q || q.length < 10) {
      toast.error("Введите ИНН (10 или 12 цифр)");
      return;
    }
    setDadataLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dadata-suggest", {
        body: { query: q, type: "party" },
      });
      if (error) throw error;
      const s = data?.suggestions?.[0];
      if (!s) {
        toast.warning("Организация не найдена");
        return;
      }
      const d = s.data || {};
      setVars((prev) => ({
        ...prev,
        counterparty_name: s.value || prev.counterparty_name,
        counterparty_inn: d.inn || prev.counterparty_inn,
        counterparty_kpp: d.kpp || prev.counterparty_kpp,
        counterparty_ogrn: d.ogrn || prev.counterparty_ogrn,
        counterparty_address: d.address?.value || prev.counterparty_address,
        counterparty_signatory: d.management?.name || prev.counterparty_signatory,
        counterparty_signatory_position: d.management?.post || prev.counterparty_signatory_position,
      }));
      toast.success("Реквизиты подгружены");
    } catch (e: any) {
      toast.error("Не удалось получить реквизиты: " + (e?.message || e));
    } finally {
      setDadataLoading(false);
    }
  };

  const buildPreview = () => {
    if (!vars.counterparty_name.trim()) {
      toast.error("Укажите название/ФИО контрагента");
      return null;
    }
    return renderAdminDoc(docType, vars);
  };

  const handlePreview = () => {
    const html = buildPreview();
    if (html) setPreviewHtml(html);
  };

  const handlePrint = () => {
    const html = buildPreview();
    if (html) printHtmlContent(html, meta.title);
  };

  const handleDownloadDoc = () => {
    const html = buildPreview();
    if (!html) return;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const fname = `${meta.title.replace(/[^\w-]+/g, "_")}_${vars.doc_number || "draft"}.doc`;
    const a = document.createElement("a");
    a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleSave = async () => {
    const html = buildPreview();
    if (!html) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("admin_generated_documents").insert({
      doc_type: docType,
      doc_number: vars.doc_number || null,
      doc_date: vars.doc_date,
      counterparty_kind: vars.counterparty_kind,
      counterparty_name: vars.counterparty_name,
      counterparty_inn: vars.counterparty_inn || null,
      variables: vars as any,
      html_content: html,
      status: "draft",
      created_by: userData.user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error("Ошибка сохранения: " + error.message);
      return;
    }
    toast.success("Документ сохранён в историю");
    setVars(emptyVars);
    setTab("history");
    loadHistory();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Удалить документ безвозвратно?")) return;
    const { error } = await supabase.from("admin_generated_documents").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Удалён");
    loadHistory();
  };

  const isIndividual = vars.counterparty_kind === "individual";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" /> Документы Синтагмы
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Генерация договоров и согласий по официальным реквизитам ИП Шафрановский М.М. с подписью и печатью.
          </p>
        </div>
        <Button onClick={() => { setTab("new"); setVars(emptyVars); }} className="gap-2">
          <Plus className="h-4 w-4" /> Новый документ
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="history">История ({history.length})</TabsTrigger>
          <TabsTrigger value="new">Новый документ</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Загрузка…</div>
          ) : history.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Ещё нет сгенерированных документов</CardContent></Card>
          ) : (
            <div className="grid gap-2">
              {history.map((r) => (
                <Card key={r.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="py-3 flex items-center gap-4">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {ADMIN_DOC_META[r.doc_type as AdminDocType]?.title || r.doc_type}
                        {r.doc_number && <span className="text-muted-foreground"> № {r.doc_number}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.counterparty_name} · {new Date(r.doc_date).toLocaleDateString("ru-RU")}
                      </div>
                    </div>
                    <Badge variant="secondary">{r.status}</Badge>
                    <Button size="sm" variant="outline" onClick={() => setPreviewHtml(r.html_content)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => printHtmlContent(r.html_content, "Документ")}>
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="new" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">1. Тип документа</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-2">
                {(Object.keys(ADMIN_DOC_META) as AdminDocType[]).map((k) => {
                  const m = ADMIN_DOC_META[k];
                  const active = docType === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setDocType(k)}
                      className={`text-left rounded-lg border p-3 transition-all ${active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"}`}
                    >
                      <div className="font-medium text-sm">{m.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">2. Контрагент</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <RadioGroup
                value={vars.counterparty_kind}
                onValueChange={(v) => updateVar("counterparty_kind", v as CounterpartyKind)}
                className="flex flex-wrap gap-4"
              >
                <div className="flex items-center gap-2"><RadioGroupItem value="legal" id="k-legal" /><Label htmlFor="k-legal">Юр. лицо</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="ip" id="k-ip" /><Label htmlFor="k-ip">ИП</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="individual" id="k-ind" /><Label htmlFor="k-ind">Физ. лицо</Label></div>
              </RadioGroup>

              {!isIndividual && (
                <div className="flex gap-2">
                  <Input placeholder="ИНН" value={vars.counterparty_inn || ""} onChange={(e) => updateVar("counterparty_inn", e.target.value)} />
                  <Button variant="outline" onClick={lookupDadata} disabled={dadataLoading}>
                    {dadataLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Найти по ИНН"}
                  </Button>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-2">
                <div>
                  <Label>{isIndividual ? "ФИО" : "Наименование"}</Label>
                  <Input value={vars.counterparty_name} onChange={(e) => updateVar("counterparty_name", e.target.value)} />
                </div>
                {!isIndividual && (
                  <>
                    <div><Label>КПП</Label><Input value={vars.counterparty_kpp || ""} onChange={(e) => updateVar("counterparty_kpp", e.target.value)} /></div>
                    <div><Label>ОГРН/ОГРНИП</Label><Input value={vars.counterparty_ogrn || ""} onChange={(e) => updateVar("counterparty_ogrn", e.target.value)} /></div>
                    <div><Label>Подписант (ФИО)</Label><Input value={vars.counterparty_signatory || ""} onChange={(e) => updateVar("counterparty_signatory", e.target.value)} /></div>
                    <div><Label>Должность подписанта</Label><Input value={vars.counterparty_signatory_position || ""} onChange={(e) => updateVar("counterparty_signatory_position", e.target.value)} /></div>
                  </>
                )}
                {isIndividual && (
                  <>
                    <div><Label>Паспорт (серия, номер, кем выдан)</Label><Input value={vars.individual_passport || ""} onChange={(e) => updateVar("individual_passport", e.target.value)} /></div>
                    <div><Label>Дата рождения</Label><Input type="date" value={vars.individual_birthdate || ""} onChange={(e) => updateVar("individual_birthdate", e.target.value)} /></div>
                  </>
                )}
                <div className="md:col-span-2"><Label>Адрес</Label><Input value={vars.counterparty_address || ""} onChange={(e) => updateVar("counterparty_address", e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" value={vars.counterparty_email || ""} onChange={(e) => updateVar("counterparty_email", e.target.value)} /></div>
                <div><Label>Телефон</Label><Input value={vars.counterparty_phone || ""} onChange={(e) => updateVar("counterparty_phone", e.target.value)} /></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">3. Параметры документа</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid md:grid-cols-3 gap-2">
                <div><Label>Номер</Label><Input placeholder="напр. 42/2026" value={vars.doc_number} onChange={(e) => updateVar("doc_number", e.target.value)} /></div>
                <div><Label>Дата</Label><Input type="date" value={vars.doc_date} onChange={(e) => updateVar("doc_date", e.target.value)} /></div>
                {meta.requiresAmount && (
                  <div><Label>Сумма (₽)</Label><Input value={vars.amount || ""} onChange={(e) => updateVar("amount", e.target.value)} placeholder="0.00" /></div>
                )}
              </div>
              {(docType === "paid_contract" || docType === "free_contract" || docType === "mixed_package") && (
                <>
                  <div><Label>Предмет / услуги</Label><Textarea rows={2} value={vars.subject || ""} onChange={(e) => updateVar("subject", e.target.value)} placeholder="Оказание образовательных услуг на платформе Синтагма" /></div>
                  <div><Label>Срок</Label><Input value={vars.term || ""} onChange={(e) => updateVar("term", e.target.value)} placeholder="с даты подписания до 31 декабря" /></div>
                </>
              )}
              {(docType === "pdn_consent" || docType === "mixed_package") && (
                <>
                  <div><Label>Цели обработки ПДн</Label><Textarea rows={2} value={vars.purposes || ""} onChange={(e) => updateVar("purposes", e.target.value)} /></div>
                  <div><Label>Срок действия согласия</Label><Input value={vars.duration || ""} onChange={(e) => updateVar("duration", e.target.value)} /></div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2 sticky bottom-4 bg-background/95 backdrop-blur border rounded-lg p-3 shadow-lg">
            <Button variant="outline" onClick={handlePreview}><Eye className="h-4 w-4 mr-1" /> Предпросмотр</Button>
            <Button variant="outline" onClick={handleDownloadDoc}><Download className="h-4 w-4 mr-1" /> DOC</Button>
            <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Печать / PDF</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Сохранить в историю
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!previewHtml} onOpenChange={(o) => !o && setPreviewHtml(null)}>
        <DialogContent className="max-w-5xl h-[85vh] p-0 flex flex-col">
          <DialogHeader className="p-4 border-b"><DialogTitle>Предпросмотр документа</DialogTitle></DialogHeader>
          {previewHtml && (
            <iframe srcDoc={previewHtml} className="flex-1 w-full border-0" title="preview" />
          )}
          <DialogFooter className="p-3 border-t">
            <Button variant="outline" onClick={() => previewHtml && printHtmlContent(previewHtml, "Документ")}>
              <Printer className="h-4 w-4 mr-1" /> Печать / PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
