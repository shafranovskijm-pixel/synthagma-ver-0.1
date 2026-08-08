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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { FileText, Download, Printer, Eye, Trash2, Plus, Loader2, Send, FileDown } from "lucide-react";
import {
  renderAdminDoc,
  ADMIN_DOC_META,
  PLAN_CONTRACT_SUBJECTS,
  PLAN_LABELS,
  type AdminDocType,
  type AdminDocVariables,
  type CounterpartyKind,
  type SubscriptionPlanKey,
} from "@/lib/adminDocTemplates";

import { printHtmlContent } from "@/utils/printHtmlToPdf";
import { renderHtmlToPdf } from "@/utils/adminDocPdf";

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
  sent_at?: string | null;
  sent_to_email?: string | null;
}

const emptyVars: AdminDocVariables = {
  doc_number: "",
  doc_date: new Date().toISOString().slice(0, 10),
  counterparty_kind: "legal",
  counterparty_name: "",
  plan: "start",
  subject: PLAN_CONTRACT_SUBJECTS.start,
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
  const [pdfLoading, setPdfLoading] = useState(false);

  // Send dialog
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTargetId, setSendTargetId] = useState<string | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [sendHtml, setSendHtml] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const meta = ADMIN_DOC_META[docType];
  const isContract = docType === "paid_contract" || docType === "free_contract" || docType === "mixed_package";
  const isFreeContract = docType === "free_contract";

  // Free contract всегда бесплатный тариф; для остальных — по выбору
  useEffect(() => {
    if (isFreeContract && vars.plan !== "free") {
      setVars((p) => ({ ...p, plan: "free", subject: PLAN_CONTRACT_SUBJECTS.free }));
    } else if (!isFreeContract && vars.plan === "free") {
      setVars((p) => ({ ...p, plan: "start", subject: PLAN_CONTRACT_SUBJECTS.start }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFreeContract]);

  const loadHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("admin_generated_documents")
      .select("id, doc_type, doc_number, doc_date, counterparty_name, counterparty_kind, status, html_content, created_at, sent_at, sent_to_email")
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

  const updateVar = <K extends keyof AdminDocVariables>(k: K, v: AdminDocVariables[K]) =>
    setVars((prev) => ({ ...prev, [k]: v }));

  const handlePlanChange = (plan: SubscriptionPlanKey) => {
    setVars((prev) => ({ ...prev, plan, subject: PLAN_CONTRACT_SUBJECTS[plan] }));
  };

  const lookupDadata = async () => {
    const q = vars.counterparty_inn?.trim();
    if (!q || q.length < 10) {
      toast.error("Введите ИНН (10 или 12 цифр)");
      return;
    }
    setDadataLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dadata-company", {
        body: { inn: q },
      });
      if (error) throw error;
      const c = data?.company;
      if (!data?.success || !c) {
        toast.warning("Организация не найдена");
        return;
      }
      setVars((prev) => ({
        ...prev,
        counterparty_name: c.name || prev.counterparty_name,
        counterparty_inn: c.inn || prev.counterparty_inn,
        counterparty_kpp: c.kpp || prev.counterparty_kpp,
        counterparty_ogrn: c.ogrn || prev.counterparty_ogrn,
        counterparty_address: c.address || prev.counterparty_address,
        counterparty_signatory: c.management || prev.counterparty_signatory,
        counterparty_signatory_position: c.managementPosition || prev.counterparty_signatory_position,
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

  const handleDownloadPdf = async (html?: string, name?: string) => {
    const source = html || buildPreview();
    if (!source) return;
    setPdfLoading(true);
    try {
      const fname = (name || `${meta.title.replace(/[^\w-]+/g, "_")}_${vars.doc_number || "draft"}`) + ".pdf";
      await renderHtmlToPdf(source, fname);
    } catch (e: any) {
      toast.error("Не удалось сформировать PDF: " + (e?.message || e));
    } finally {
      setPdfLoading(false);
    }
  };

  const persistDocument = async (): Promise<{ id: string; html: string } | null> => {
    const html = buildPreview();
    if (!html) return null;
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("admin_generated_documents").insert({
      doc_type: docType,
      doc_number: vars.doc_number || null,
      doc_date: vars.doc_date,
      counterparty_kind: vars.counterparty_kind,
      counterparty_name: vars.counterparty_name,
      counterparty_inn: vars.counterparty_inn || null,
      plan: vars.plan || null,
      variables: vars as any,
      html_content: html,
      status: "draft",
      created_by: userData.user?.id ?? null,
    }).select("id").single();
    if (error) {
      toast.error("Ошибка сохранения: " + error.message);
      return null;
    }
    return { id: data.id, html };
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await persistDocument();
    setSaving(false);
    if (!res) return;
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

  // ==== Send flow ====
  const openSendFromHistory = (row: HistoryRow) => {
    setSendTargetId(row.id);
    setSendHtml(row.html_content);
    setSendEmail(row.sent_to_email || "");
    setSendMessage(`Здравствуйте! Направляем документ «${ADMIN_DOC_META[row.doc_type as AdminDocType]?.title || "документ"}»${row.doc_number ? ` № ${row.doc_number}` : ""}.`);
    setSendOpen(true);
  };

  const openSendFromWizard = async () => {
    if (!vars.counterparty_email && !vars.counterparty_inn) {
      toast.error("Укажите email контрагента или ИНН для поиска организации");
      return;
    }
    setSaving(true);
    const res = await persistDocument();
    setSaving(false);
    if (!res) return;
    setSendTargetId(res.id);
    setSendHtml(res.html);
    setSendEmail(vars.counterparty_email || "");
    setSendMessage(`Здравствуйте! Направляем документ «${meta.title}»${vars.doc_number ? ` № ${vars.doc_number}` : ""}.`);
    setSendOpen(true);
    loadHistory();
  };

  const handleSend = async () => {
    if (!sendTargetId || !sendHtml) return;
    if (!sendEmail.trim() || !/^\S+@\S+\.\S+$/.test(sendEmail.trim())) {
      toast.error("Введите корректный email");
      return;
    }
    setSending(true);
    try {
      // 1. Найдём организацию-клиента по ИНН из документа
      const row = history.find((r) => r.id === sendTargetId);
      const inn = row?.counterparty_kind && (await supabase
        .from("admin_generated_documents")
        .select("counterparty_inn, doc_type, doc_number")
        .eq("id", sendTargetId)
        .maybeSingle()).data;
      const cpInn = inn?.counterparty_inn as string | undefined;
      let orgId: string | null = null;
      if (cpInn) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id")
          .eq("inn", cpInn)
          .maybeSingle();
        orgId = org?.id ?? null;
      }

      // 2. PDF blob → data-url для встраивания как приложение недоступно.
      //    Прикладываем ссылку и весь HTML-документ в теле письма.
      const wrappedHtml = `
        <div style="font-family:Arial,sans-serif;padding:16px;">
          <p>${escapeHtml(sendMessage).replace(/\n/g, "<br/>")}</p>
          <p style="color:#666;font-size:13px;">Документ размещён ниже. Также вы можете распечатать / сохранить его как PDF из своего почтового клиента.</p>
          <hr style="margin:16px 0;border:none;border-top:1px solid #ddd;"/>
          ${sendHtml}
        </div>
      `;

      const { error: mailErr } = await supabase.functions.invoke("send-email", {
        body: {
          to: sendEmail.trim(),
          subject: `Документ от СИНТАГМЫ${row?.doc_number ? ` № ${row.doc_number}` : ""}`,
          html: wrappedHtml,
        },
      });
      if (mailErr) throw mailErr;

      // 3. Обновим статус документа
      await supabase
        .from("admin_generated_documents")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_to_email: sendEmail.trim(),
          sent_to_organization_id: orgId,
        })
        .eq("id", sendTargetId);

      // 4. Если организация-клиент найдена — добавим в её "Документы" и уведомления
      if (orgId && row) {
        const docTitle = `${ADMIN_DOC_META[row.doc_type as AdminDocType]?.title || "Документ"}${row.doc_number ? ` № ${row.doc_number}` : ""}`;
        await supabase.from("org_documents").insert({
          organization_id: orgId,
          name: docTitle,
          type: "admin_contract",
          issue_date: row.doc_date,
        });

        // Уведомления для всех сотрудников организации
        const { data: staff } = await supabase
          .from("org_staff")
          .select("user_id")
          .eq("organization_id", orgId);
        if (staff && staff.length) {
          const notifications = staff.map((s: any) => ({
            organization_id: orgId,
            user_id: s.user_id,
            type: "admin_document",
            title: "Новый документ от СИНТАГМЫ",
            message: docTitle,
            is_read: false,
          }));
          await supabase.from("org_notifications").insert(notifications);
        }
      }

      toast.success(orgId
        ? "Отправлено. Документ добавлен в кабинет заказчика и в уведомления."
        : "Отправлено на email контрагента.");
      setSendOpen(false);
      setSendTargetId(null);
      setSendHtml(null);
      loadHistory();
    } catch (e: any) {
      toast.error("Ошибка отправки: " + (e?.message || e));
    } finally {
      setSending(false);
    }
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
        <Button onClick={() => { setTab("new"); setVars(initialVars); }} className="gap-2">
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
                  <CardContent className="py-3 flex flex-wrap items-center gap-2">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-[240px]">
                      <div className="font-medium truncate">
                        {ADMIN_DOC_META[r.doc_type as AdminDocType]?.title || r.doc_type}
                        {r.doc_number && <span className="text-muted-foreground"> № {r.doc_number}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.counterparty_name} · {new Date(r.doc_date).toLocaleDateString("ru-RU")}
                        {r.sent_at && r.sent_to_email && <> · отправлено на {r.sent_to_email}</>}
                      </div>
                    </div>
                    <Badge variant={r.status === "sent" ? "default" : "secondary"}>
                      {r.status === "sent" ? "отправлен" : r.status}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => setPreviewHtml(r.html_content)} title="Просмотр">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => printHtmlContent(r.html_content, "Документ")} title="Печать">
                      <Printer className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={() => handleDownloadPdf(r.html_content, `${ADMIN_DOC_META[r.doc_type as AdminDocType]?.title || "document"}_${r.doc_number || r.id.slice(0, 6)}`)}
                      title="Скачать PDF">
                      <FileDown className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openSendFromHistory(r)} title="Отправить контрагенту">
                      <Send className="h-4 w-4" />
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

              {isContract && (
                <div>
                  <Label>Тариф</Label>
                  {isFreeContract ? (
                    <div className="mt-1 px-3 py-2 rounded-md border bg-muted/40 text-sm">
                      Бесплатный — фиксируется автоматически для безвозмездного договора
                    </div>
                  ) : (
                    <Select
                      value={vars.plan || "start"}
                      onValueChange={(v) => handlePlanChange(v as SubscriptionPlanKey)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["start", "standard", "professional", "maximum"] as SubscriptionPlanKey[]).map((k) => (
                          <SelectItem key={k} value={k}>{PLAN_LABELS[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    При смене тарифа автоматически подставляется соответствующий предмет договора. Текст можно скорректировать вручную ниже.
                  </p>
                </div>
              )}

              {isContract && (
                <>
                  <div><Label>Предмет / услуги</Label><Textarea rows={6} value={vars.subject || ""} onChange={(e) => updateVar("subject", e.target.value)} /></div>
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

          <div className="flex flex-wrap justify-end gap-2 sticky bottom-4 bg-background/95 backdrop-blur border rounded-lg p-3 shadow-lg">
            <Button variant="outline" onClick={handlePreview}><Eye className="h-4 w-4 mr-1" /> Предпросмотр</Button>
            <Button variant="outline" onClick={handleDownloadDoc}><Download className="h-4 w-4 mr-1" /> DOC</Button>
            <Button variant="outline" onClick={() => handleDownloadPdf()} disabled={pdfLoading}>
              {pdfLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />} PDF
            </Button>
            <Button variant="outline" onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Печать</Button>
            <Button variant="outline" onClick={openSendFromWizard} disabled={saving || sending}>
              <Send className="h-4 w-4 mr-1" /> Отправить контрагенту
            </Button>
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
          <DialogFooter className="p-3 border-t gap-2">
            <Button variant="outline" onClick={() => previewHtml && handleDownloadPdf(previewHtml, "document")}>
              <FileDown className="h-4 w-4 mr-1" /> PDF
            </Button>
            <Button variant="outline" onClick={() => previewHtml && printHtmlContent(previewHtml, "Документ")}>
              <Printer className="h-4 w-4 mr-1" /> Печать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={(o) => { if (!sending) setSendOpen(o); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Отправить документ контрагенту</DialogTitle>
            <DialogDescription>
              Документ будет отправлен на email. Если контрагент найдётся среди клиентов СИНТАГМЫ по ИНН — он появится у него во вкладке «Документы» и в уведомлениях.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email получателя</Label>
              <Input type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="client@example.com" />
            </div>
            <div>
              <Label>Сопроводительное сообщение</Label>
              <Textarea rows={4} value={sendMessage} onChange={(e) => setSendMessage(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)} disabled={sending}>Отмена</Button>
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Отправить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
