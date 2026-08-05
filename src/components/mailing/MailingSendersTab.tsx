// Этап 3 — «Отправители»: мастер подключения аккаунтов организации.
// Пароль отправляется на сервер один раз и шифруется триггером; клиент
// его никогда не читает (нет SELECT-гранта на password_encrypted).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { Plus, AtSign, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
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
} from "@/lib/mailing/senderPresets";

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
  imap_host: string | null;
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
  "id,label,from_name,from_email,smtp_host,smtp_port,imap_host,smtp_status,imap_status,smtp_error_category,imap_error_category,smtp_latency_ms,imap_latency_ms,preset_key,is_active";

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
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>("preset");
  const [draft, setDraft] = useState<SenderDraft>(emptySenderDraft());
  const [saving, setSaving] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  const load = async () => {
    if (!organizationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("mailing_senders")
      .select(SELECT_COLS)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Не удалось загрузить отправителей");
      return;
    }
    setRows((data || []) as unknown as SenderRow[]);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const stepIndex = useMemo(() => STEPS.findIndex((s) => s.key === step), [step]);

  const reset = () => {
    setDraft(emptySenderDraft());
    setStep("preset");
    setCreatedId(null);
  };

  const next = () => {
    const gate = validateStep(step, draft, true);
    if (!gate.ok) {
      toast.error(gate.reason!);
      return;
    }
    const nextStep = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)].key;
    setStep(nextStep);
  };

  const save = async () => {
    if (!organizationId) return;
    const gate = validateSenderDraft(draft, true);
    if (!gate.ok) {
      toast.error(gate.reason!);
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("mailing_senders")
      .insert({ ...toSenderRow(draft, organizationId), password_encrypted: draft.password } as never)
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast.error("Ошибка сохранения: " + error.message);
      return;
    }
    // Пароль стираем из состояния формы сразу после отправки.
    setDraft((d) => ({ ...d, password: "" }));
    setCreatedId((data as { id: string }).id);
    toast.success("Отправитель сохранён. Пароль зашифрован на сервере.");
    void load();
  };

  const runTest = async (senderId: string, mode: "smtp" | "imap") => {
    setTesting(`${senderId}:${mode}`);
    const { data, error } = await supabase.functions.invoke("mailing-sender-test", {
      body: { sender_id: senderId, mode },
    });
    setTesting(null);
    if (error) {
      toast.error("Тест не выполнен");
      return;
    }
    const res = data as { success?: boolean; error_category?: string | null; latency_ms?: number };
    if (res?.success) {
      toast.success(`${mode.toUpperCase()}: успешно (${res.latency_ms ?? 0} мс)`);
    } else {
      toast.error(`${mode.toUpperCase()}: ${CATEGORY_LABEL[res?.error_category || "unknown"]}`);
    }
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex-1 font-display text-xl font-semibold">Отправители</h2>
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

      {!loading && rows.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Аккаунтов пока нет. Добавьте первый — например, пресет torgi.com.ru.
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
            <OrgSmtpSettings />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : (setOpen(false), reset()))}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Подключение отправителя — {STEPS[stepIndex].label}</DialogTitle>
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
                  <Label>Название аккаунта</Label>
                  <Input
                    value={draft.label}
                    onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                    placeholder="Торги — основной"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Имя отправителя</Label>
                  <Input
                    value={draft.fromName}
                    onChange={(e) => setDraft((d) => ({ ...d, fromName: e.target.value }))}
                    placeholder="СИНТАГМА"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Email отправителя</Label>
                  <Input
                    type="email"
                    value={draft.fromEmail}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        fromEmail: e.target.value,
                        smtpUsername: d.smtpUsername || e.target.value,
                      }))
                    }
                    placeholder="info@torgi.com.ru"
                  />
                </div>
              </div>
            )}

            {step === "smtp" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>SMTP-хост</Label>
                  <Input
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
                  <Label>Логин</Label>
                  <Input
                    value={draft.smtpUsername}
                    onChange={(e) => setDraft((d) => ({ ...d, smtpUsername: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Пароль ящика</Label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={draft.password}
                    onChange={(e) => setDraft((d) => ({ ...d, password: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Пароль уходит на сервер один раз, шифруется и больше не отображается.
                  </p>
                </div>
              </div>
            )}

            {step === "imap" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>IMAP-хост</Label>
                  <Input
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
                  IMAP пока используется только для проверки доступа: письма не читаются.
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
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {stepIndex > 0 && (
              <Button variant="ghost" onClick={() => setStep(STEPS[stepIndex - 1].key)}>
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
    </div>
  );
}
