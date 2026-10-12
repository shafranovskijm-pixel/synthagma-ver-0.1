// Этап 3 — «Отправители»: мастер подключения аккаунтов организации.
// Пароль отправляется на сервер один раз и шифруется триггером; клиент
// его никогда не читает (нет SELECT-гранта на password_encrypted).
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, AtSign, ShieldCheck, ShieldAlert, Loader2, Eye, EyeOff, ListPlus } from "lucide-react";
import { OrgSmtpSettings } from "@/components/organization/sales/OrgSmtpSettings";
import {
  SENDER_PRESETS,
  SenderDraft,
  WizardStep,
  applyPreset,
  emptySenderDraft,
  toSenderRow,
  validateSenderDraft,
  validateStep,
  withSenderEmail,
} from "@/lib/mailing/senderPresets";
import { chunkSenderRows, parseSenderBatch, senderRowsForRpc } from "@/lib/mailing/senderBatch";

const STEPS: { key: WizardStep; label: string }[] = [
  { key: "preset", label: "Пресет" },
  { key: "identity", label: "Email и имя" },
  { key: "smtp", label: "SMTP" },
  { key: "imap", label: "IMAP" },
  { key: "tests", label: "Тесты" },
];

interface SenderRow {
  id: string;
  label: string;
  from_name: string | null;
  from_email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: SenderDraft["smtpSecurity"];
  smtp_username: string;
  imap_host: string | null;
  imap_port: number | null;
  imap_security: SenderDraft["imapSecurity"] | null;
  imap_username: string | null;
  daily_limit: number;
  smtp_status: string;
  imap_status: string;
  smtp_error_category: string | null;
  imap_error_category: string | null;
  smtp_latency_ms: number | null;
  imap_latency_ms: number | null;
  preset_key: string | null;
  is_active: boolean;
}

const SELECT_COLS =
  "id,label,from_name,from_email,smtp_host,smtp_port,smtp_security,smtp_username,imap_host,imap_port,imap_security,imap_username,daily_limit,smtp_status,imap_status,smtp_error_category,imap_error_category,smtp_latency_ms,imap_latency_ms,preset_key,is_active";

const CATEGORY_LABEL: Record<string, string> = {
  auth: "Ошибка авторизации",
  connection: "Нет соединения",
  tls: "Ошибка TLS",
  timeout: "Таймаут",
  config: "Не хватает настроек",
  unknown: "Неизвестная ошибка",
};

function StatusBadge({ status, category }: { status: string; category: string | null }) {
  if (status === "ok") {
    return (
      <Badge variant="secondary" className="gap-1">
        <ShieldCheck className="h-3 w-3" /> OK
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="h-3 w-3" /> {CATEGORY_LABEL[category || "unknown"]}
      </Badge>
    );
  }
  return <Badge variant="outline">Не проверен</Badge>;
}

export function MailingSendersTab({ organizationId }: { organizationId: string | null }) {
  const [rows, setRows] = useState<SenderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("preset");
  const [draft, setDraft] = useState<SenderDraft>(emptySenderDraft());
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [changingActive, setChangingActive] = useState<string | null>(null);
  const contextGeneration = useRef(0);
  const loadSequence = useRef(0);
  const formGeneration = useRef(0);
  const [testing, setTesting] = useState<string | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRaw, setBatchRaw] = useState("");
  const [batchVisible, setBatchVisible] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  const batchPreview = useMemo(() => {
    try {
      return { parsed: parseSenderBatch(batchRaw, 500), error: "" };
    } catch (error) {
      return { parsed: null, error: (error as Error).message };
    }
  }, [batchRaw]);

  const load = async () => {
    if (!organizationId) return;
    const context = contextGeneration.current;
    const sequence = ++loadSequence.current;
    const isCurrent = () => context === contextGeneration.current && sequence === loadSequence.current;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("mailing_senders")
        .select(SELECT_COLS)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (!isCurrent()) return;
      if (error) throw error;
      setRows((data || []) as unknown as SenderRow[]);
      setLoadError(false);
    } catch {
      if (isCurrent()) setLoadError(true);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useLayoutEffect(() => {
    contextGeneration.current++;
    formGeneration.current++;
    setRows([]);
    setLoadError(false);
    setOpen(false);
    setDraft(emptySenderDraft());
    setEditingId(null);
    setCreatedId(null);
    setSaving(false);
    setTesting(null);
    setChangingActive(null);
    setBatchOpen(false);
    setBatchRaw("");
    setBatchVisible(false);
    setBatchBusy(false);
    setBatchTesting(false);
    setBatchProgress({ done: 0, total: 0 });
    void load();
    return () => { contextGeneration.current++; formGeneration.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const stepIndex = useMemo(() => STEPS.findIndex((s) => s.key === step), [step]);

  const reset = () => {
    formGeneration.current++;
    setDraft(emptySenderDraft());
    setStep("preset");
    setCreatedId(null);
    setEditingId(null);
  };

  const editSender = (sender: SenderRow) => {
    reset();
    setEditingId(sender.id);
    setDraft({
      presetKey: sender.preset_key || "custom", label: sender.label,
      fromName: sender.from_name || "", fromEmail: sender.from_email,
      smtpHost: sender.smtp_host, smtpPort: sender.smtp_port,
      smtpSecurity: sender.smtp_security, smtpUsername: sender.smtp_username,
      imapHost: sender.imap_host || "", imapPort: sender.imap_port || 993,
      imapSecurity: "ssl", imapUsername: sender.imap_username || "",
      dailyLimit: sender.daily_limit, password: "",
    });
    setStep("identity");
    setOpen(true);
  };

  const next = () => {
    const gate = validateStep(step, draft, !editingId);
    if (!gate.ok) {
      toast.error(gate.reason!);
      return;
    }
    const nextStep = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].key;
    setStep(nextStep);
  };

  const save = async () => {
    if (!organizationId) return;
    const gate = validateSenderDraft(draft, !editingId);
    if (!gate.ok) {
      toast.error(gate.reason!);
      return;
    }
    const context = contextGeneration.current;
    const form = formGeneration.current;
    const isCurrent = () => context === contextGeneration.current && form === formGeneration.current;
    setSaving(true);
    try {
      const { organization_id: _organizationId, ...settings } = toSenderRow(draft, organizationId);
      const { data, error } = await (supabase as any).rpc("save_mailing_sender", {
        p_sender_id: editingId,
        p_organization_id: organizationId,
        p_settings: settings,
        p_password: draft.password || null,
      });
      if (!isCurrent()) return;
      if (error) throw error;
      if (!data?.id) throw new Error("Сервер не подтвердил сохранение отправителя");
      setDraft((d) => ({ ...d, password: "" }));
      setCreatedId(data.id);
      setEditingId(data.id);
      toast.success("Отправитель сохранён. После изменения подключения выполните SMTP/IMAP-тесты.");
      void load();
    } catch {
      if (isCurrent()) toast.error("Не удалось сохранить отправителя. Проверьте доступ и повторите попытку.");
    } finally {
      if (isCurrent()) setSaving(false);
    }
  };

  const setSenderActive = async (sender: SenderRow) => {
    if (!organizationId) return;
    const context = contextGeneration.current;
    const isCurrent = () => context === contextGeneration.current;
    setChangingActive(sender.id);
    try {
      const { data, error } = await (supabase as any).rpc("set_mailing_sender_active", {
        p_sender_id: sender.id, p_organization_id: organizationId, p_is_active: !sender.is_active,
      });
      if (!isCurrent()) return;
      if (error || data?.id !== sender.id || data?.is_active !== !sender.is_active) throw error || new Error("Unconfirmed sender change");
      toast.success(sender.is_active ? "Ящик отключён. История рассылок сохранена." : "Ящик включён");
      await load();
    } catch {
      if (isCurrent()) toast.error("Не удалось изменить состояние ящика. Проверьте доступ и результаты SMTP/IMAP-тестов.");
    } finally {
      if (isCurrent()) setChangingActive(null);
    }
  };

  const runTest = async (senderId: string, mode: "smtp" | "imap") => {
    const context = contextGeneration.current;
    setTesting(`${senderId}:${mode}`);
    try {
      const { data, error } = await supabase.functions.invoke("mailing-sender-test", {
        body: { sender_id: senderId, mode },
      });
      if (context !== contextGeneration.current) return;
      if (error) throw error;
      if (data?.success === true) {
        toast.success(`${mode.toUpperCase()}: успешно (${data.latency_ms ?? 0} мс)`);
      } else {
        toast.error(`${mode.toUpperCase()}: ${CATEGORY_LABEL[data?.error_category || "unknown"]}`);
      }
      void load();
    } catch {
      if (context === contextGeneration.current) toast.error("Тест не выполнен. Проверьте доступ и соединение, затем повторите попытку.");
    } finally {
      if (context === contextGeneration.current) setTesting(null);
    }
  };

  const importBatch = async () => {
    if (!organizationId || !batchPreview.parsed?.rows.length) return;
    if (batchPreview.parsed.invalidLines.length) {
      toast.error(`Исправьте строки: ${batchPreview.parsed.invalidLines.slice(0, 10).join(", ")}`);
      return;
    }
    const rpcRows = senderRowsForRpc(batchPreview.parsed.rows);
    const context = contextGeneration.current;
    const isCurrent = () => context === contextGeneration.current;
    // Clear visible secrets before the first network request. They are never persisted locally.
    setBatchRaw("");
    setBatchBusy(true);
    let created = 0;
    let existing = 0;
    let invalid = 0;
    try {
      for (const chunk of chunkSenderRows(rpcRows, 50)) {
        if (!isCurrent()) return;
        const { data, error } = await (supabase as any).rpc("import_mailing_senders_batch", {
          p_organization_id: organizationId,
          p_rows: chunk,
        });
        if (!isCurrent()) return;
        if (error) throw error;
        created += Number(data?.created || 0);
        existing += Number(data?.existing || 0);
        invalid += Number(data?.invalid || 0);
      }
      toast.success(`Подключено: ${created}; уже были: ${existing}; отклонено: ${invalid}. Новые ящики выключены до тестов.`);
      setBatchOpen(false);
      await load();
    } catch (error) {
      if (isCurrent()) toast.error(`Пакетное подключение не завершено: ${(error as Error).message}`);
    } finally {
      rpcRows.forEach((row) => { row.password = ""; });
      if (isCurrent()) setBatchBusy(false);
    }
  };

  const testAllSenders = async () => {
    const context = contextGeneration.current;
    const isCurrent = () => context === contextGeneration.current;
    const candidates = rows.filter((row) => row.smtp_status !== "ok" || row.imap_status !== "ok");
    if (!candidates.length) {
      toast.success("Все отправители уже прошли SMTP/IMAP-проверку");
      return;
    }
    setBatchTesting(true);
    setBatchProgress({ done: 0, total: candidates.length });
    let cursor = 0;
    let passed = 0;
    let failed = 0;
    const worker = async () => {
      while (isCurrent() && cursor < candidates.length) {
        const sender = candidates[cursor++];
        let ok = true;
        for (const mode of ["smtp", "imap"] as const) {
          if (!isCurrent()) return;
          try {
            const { data, error } = await supabase.functions.invoke("mailing-sender-test", {
              body: { sender_id: sender.id, mode },
            });
            if (error || data?.success !== true) ok = false;
          } catch {
            ok = false;
          }
        }
        if (!isCurrent()) return;
        if (ok) passed += 1;
        else failed += 1;
        setBatchProgress((progress) => ({ ...progress, done: progress.done + 1 }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, () => worker()));
    if (!isCurrent()) return;
    setBatchTesting(false);
    if (failed) toast.warning(`Проверено: ${candidates.length}; успешно: ${passed}; с ошибкой: ${failed}`);
    else toast.success(`Все ${passed} ящиков прошли SMTP/IMAP-проверку`);
    await load();
  };

  const activateVerified = async () => {
    if (!organizationId) return;
    const context = contextGeneration.current;
    const isCurrent = () => context === contextGeneration.current;
    setChangingActive("batch");
    try {
      const { data, error } = await (supabase as any).rpc("activate_verified_mailing_senders", {
        p_organization_id: organizationId,
      });
      if (!isCurrent()) return;
      if (error || typeof data !== "number" || !Number.isInteger(data) || data < 0) throw error || new Error("Unconfirmed activation");
      toast.success(`Активировано ящиков: ${data}`);
      await load();
    } catch {
      if (isCurrent()) toast.error("Не удалось активировать проверенные ящики");
    } finally {
      if (isCurrent()) setChangingActive(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 font-display text-xl font-semibold">Почта — отправители</h2>
        <Button
          variant="outline"
          onClick={() => setBatchOpen(true)}
          className="gap-1"
          disabled={!organizationId || batchBusy || batchTesting}
          data-testid="sender-batch-open"
        >
          <ListPlus className="h-4 w-4" /> Пакетное подключение mail.torgi.com.ru
        </Button>
        <Button
          variant="outline"
          onClick={testAllSenders}
          disabled={!rows.length || batchTesting || batchBusy}
          data-testid="sender-test-all"
        >
          {batchTesting ? `Проверка ${batchProgress.done}/${batchProgress.total}` : "Проверить все"}
        </Button>
        <Button
          variant="outline"
          onClick={activateVerified}
          disabled={!rows.some((row) => !row.is_active && row.smtp_status === "ok" && row.imap_status === "ok") || batchTesting || changingActive !== null}
          data-testid="sender-activate-verified"
        >
          Активировать проверенные
        </Button>
        <Button
          onClick={() => {
            reset();
            setOpen(true);
          }}
          className="gap-1"
          data-testid="sender-add-button"
          disabled={!organizationId}
        >
          <Plus className="h-4 w-4" /> Добавить аккаунт
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Можно подключить несколько ящиков организации. Пароль хранится только в зашифрованном виде на
        сервере и никогда не возвращается в интерфейс. Тесты проверяют лишь авторизацию — письма не
        отправляются, входящие не читаются.
      </p>

      {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {loadError && (
        <div role="alert" className="rounded-xl border border-destructive/30 p-4 space-y-2 text-sm">
          <p>Не удалось загрузить отправителей. Проверьте соединение и доступ к рассылкам.</p>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>Повторить загрузку</Button>
        </div>
      )}

      {!loading && !loadError && rows.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Аккаунтов пока нет. Подключите свой почтовый ящик по SMTP и IMAP.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {rows.map((r) => (
          <Card key={r.id} data-testid="sender-row">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <AtSign className="h-4 w-4 text-primary" />
                {r.label}
                <span className="text-sm font-normal text-muted-foreground">{r.from_email}</span>
                {r.preset_key && <Badge variant="outline">{r.preset_key}</Badge>}
                <Badge variant={r.is_active ? "secondary" : "outline"}>{r.is_active ? "Включён" : "Отключён"}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                SMTP {r.smtp_host}:{r.smtp_port}
              </span>
              <StatusBadge status={r.smtp_status} category={r.smtp_error_category} />
              <span className="text-muted-foreground">IMAP {r.imap_host || "—"}</span>
              <StatusBadge status={r.imap_status} category={r.imap_error_category} />
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => editSender(r)} disabled={saving || testing !== null || batchTesting || changingActive !== null}>
                  Изменить
                </Button>
                <Button size="sm" variant="outline" onClick={() => void setSenderActive(r)} disabled={saving || testing !== null || batchTesting || changingActive !== null || (!r.is_active && (r.smtp_status !== "ok" || r.imap_status !== "ok"))}>
                  {changingActive === r.id ? "Сохранение…" : r.is_active ? "Отключить" : "Включить"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runTest(r.id, "smtp")}
                  disabled={testing !== null}
                >
                  {testing === `${r.id}:smtp` && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Тест SMTP
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runTest(r.id, "imap")}
                  disabled={testing !== null || !r.imap_host}
                >
                  {testing === `${r.id}:imap` && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Тест IMAP
                </Button>
              </div>
              {!r.is_active && (r.smtp_status !== "ok" || r.imap_status !== "ok") && (
                <p className="w-full text-xs text-muted-foreground">{!r.imap_host ? "IMAP не настроен: откройте «Изменить», укажите IMAP-хост и выполните проверки. До этого ящик остаётся выключенным." : "Для включения ящика нужны успешные проверки SMTP и IMAP. При ошибке исправьте настройки через «Изменить»."}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Accordion type="single" collapsible>
        <AccordionItem value="legacy">
          <AccordionTrigger className="text-sm">
            Старые настройки SMTP организации (без изменений)
          </AccordionTrigger>
          <AccordionContent>
            {organizationId && <OrgSmtpSettings organizationId={organizationId} />}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={open} onOpenChange={(v) => { if (!saving && testing === null) { setOpen(v); if (!v) reset(); } }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Настройки отправителя" : "Подключение отправителя"} — {STEPS[stepIndex].label}</DialogTitle>
            <DialogDescription>Настройки собственного почтового ящика. Сохранение не запускает рассылку.</DialogDescription>
          </DialogHeader>

          <ol className="flex flex-wrap gap-2 text-xs">
            {STEPS.map((s, i) => (
              <li
                key={s.key}
                className={
                  i === stepIndex
                    ? "rounded-full bg-primary/10 px-2 py-1 text-primary"
                    : "rounded-full bg-muted px-2 py-1 text-muted-foreground"
                }
              >
                {i + 1}. {s.label}
              </li>
            ))}
          </ol>

          <div className="space-y-4 py-2">
            {step === "preset" && (
              <div className="space-y-2">
                <Label>Пресет провайдера</Label>
                <Select
                  value={draft.presetKey}
                  onValueChange={(v) => setDraft((d) => applyPreset(d, v))}
                >
                  <SelectTrigger data-testid="sender-preset-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SENDER_PRESETS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Пресет заполняет только хосты, порты и шифрование. Секретов в пресете нет.
                </p>
              </div>
            )}

            {step === "identity" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="sender-label">Название аккаунта</Label>
                  <Input
                    id="sender-label"
                    value={draft.label}
                    onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                    placeholder="Торги — основной"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sender-from-name">Имя отправителя</Label>
                  <Input
                    id="sender-from-name"
                    value={draft.fromName}
                    onChange={(e) => setDraft((d) => ({ ...d, fromName: e.target.value }))}
                    placeholder="СИНТАГМА"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="sender-from-email">Email отправителя</Label>
                  <Input
                    id="sender-from-email"
                    type="email"
                    value={draft.fromEmail}
                    onChange={(e) =>
                      setDraft((d) => withSenderEmail(d, e.target.value))
                    }
                    placeholder="info@torgi.com.ru"
                  />
                </div>
              </div>
            )}

            {step === "smtp" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="sender-smtp-host">SMTP-хост</Label>
                  <Input
                    id="sender-smtp-host"
                    value={draft.smtpHost}
                    onChange={(e) => setDraft((d) => ({ ...d, smtpHost: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Порт</Label>
                  <Input
                    type="number"
                    value={draft.smtpPort}
                    onChange={(e) => setDraft((d) => ({ ...d, smtpPort: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Шифрование</Label>
                  <Select
                    value={draft.smtpSecurity}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, smtpSecurity: v as SenderDraft["smtpSecurity"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ssl">SSL/TLS</SelectItem>
                      <SelectItem value="starttls">STARTTLS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sender-smtp-login">Логин</Label>
                  <Input
                    id="sender-smtp-login"
                    value={draft.smtpUsername}
                    onChange={(e) => setDraft((d) => ({ ...d, smtpUsername: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="sender-password">{editingId ? "Новый пароль ящика" : "Пароль ящика"}</Label>
                  <Input
                    id="sender-password"
                    type="password"
                    autoComplete="new-password"
                    value={draft.password}
                    onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {editingId ? "Оставьте пустым, чтобы сохранить пароль. При изменении подключения проверки SMTP/IMAP потребуется пройти заново." : "Пароль уходит на сервер один раз, шифруется и больше не отображается."}
                  </p>
                </div>
              </div>
            )}

            {step === "imap" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="sender-imap-host">IMAP-хост</Label>
                  <Input
                    id="sender-imap-host"
                    value={draft.imapHost}
                    onChange={(e) => setDraft((d) => ({ ...d, imapHost: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Порт</Label>
                  <Input
                    type="number"
                    value={draft.imapPort}
                    onChange={(e) => setDraft((d) => ({ ...d, imapPort: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>IMAP-логин (если отличается)</Label>
                  <Input
                    value={draft.imapUsername}
                    onChange={(e) => setDraft((d) => ({ ...d, imapUsername: e.target.value }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Для IMAP поддерживается SSL/TLS, обычно порт 993. Тест проверяет только авторизацию и не читает письма. Без IMAP можно сохранить черновик, но включить ящик для рассылок получится только после настройки и успешных проверок SMTP и IMAP.
                </p>
              </div>
            )}

            {step === "tests" && (
              <div className="space-y-3">
                {!createdId ? (
                  <p className="text-sm text-muted-foreground">
                    Сохраните аккаунт, чтобы запустить тесты подключения.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">{draft.imapHost ? "Выполните обе проверки. Затем нажмите «Готово» и включите ящик в списке отправителей." : "Сохранён черновик без IMAP. Нажмите «Назад», укажите IMAP-хост и снова сохраните настройки. Для включения ящика нужны успешные проверки SMTP и IMAP."}</p>
                    <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => runTest(createdId, "smtp")} disabled={testing !== null}>
                      Тест SMTP
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => runTest(createdId, "imap")}
                      disabled={testing !== null || !draft.imapHost}
                    >
                      Тест IMAP
                    </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {stepIndex > 0 && (
              <Button variant="ghost" disabled={saving || testing !== null} onClick={() => { setCreatedId(null); setStep(STEPS[stepIndex - 1].key); }}>
                Назад
              </Button>
            )}
            {step !== "tests" ? (
              <Button onClick={next} data-testid="sender-wizard-next">
                Далее
              </Button>
            ) : !createdId ? (
              <Button onClick={save} disabled={saving} data-testid="sender-wizard-save">
                {saving ? "Сохранение…" : "Сохранить"}
              </Button>
            ) : (
              <Button
                disabled={saving || testing !== null}
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Готово
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={batchOpen}
        onOpenChange={(value) => {
          if (batchBusy) return;
          if (value) setBatchOpen(true);
          else {
            setBatchOpen(false);
            setBatchRaw("");
            setBatchVisible(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Пакетное подключение mail.torgi.com.ru</DialogTitle>
            <DialogDescription>Только для ящиков с SMTP и IMAP на mail.torgi.com.ru. Почту другого провайдера подключите через «Добавить аккаунт» с его настройками.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              По одному ящику на строку: <code>email пароль</code>. Данные отправляются пакетами до 50 строк,
              пароли сразу шифруются сервером и очищаются из формы. Новые ящики остаются выключенными до SMTP/IMAP-проверки.
            </p>
            <div className="relative">
              <Textarea
                rows={12}
                value={batchRaw}
                onChange={(event) => setBatchRaw(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="pr-12 font-mono text-xs"
                style={batchVisible ? undefined : ({ WebkitTextSecurity: "disc" } as any)}
                placeholder="sender@torgi.com.ru пароль"
                data-testid="sender-batch-input"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1"
                onClick={() => setBatchVisible((value) => !value)}
                aria-label={batchVisible ? "Скрыть данные" : "Показать данные"}
              >
                {batchVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {batchPreview.error && <p className="text-sm text-destructive">{batchPreview.error}</p>}
            {batchPreview.parsed && (
              <p className="text-sm text-muted-foreground" data-testid="sender-batch-summary">
                Готово к подключению: {batchPreview.parsed.rows.length}; дубликатов: {batchPreview.parsed.duplicateCount};
                некорректных строк: {batchPreview.parsed.invalidLines.length}.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBatchOpen(false); setBatchRaw(""); }} disabled={batchBusy}>
              Отмена
            </Button>
            <Button
              onClick={importBatch}
              disabled={batchBusy || !batchPreview.parsed?.rows.length || !!batchPreview.parsed?.invalidLines.length}
              data-testid="sender-batch-submit"
            >
              {batchBusy ? "Подключение…" : `Подключить (${batchPreview.parsed?.rows.length || 0})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
