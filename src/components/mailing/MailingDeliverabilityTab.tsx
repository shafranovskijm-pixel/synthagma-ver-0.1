import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  AtSign,
  CheckCircle2,
  Clock3,
  Gauge,
  Inbox,
  Loader2,
  Play,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { DomainReputationCheck } from "@/components/admin/broadcast/DomainReputationCheck";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  applyDeliverabilitySeedPreset,
  DELIVERABILITY_SEED_PRESETS,
  DeliverabilityProvider,
  emptyDeliverabilitySeedDraft,
  providerForEmail,
  seedPreset,
  toDeliverabilitySeedRow,
  validateDeliverabilitySeedDraft,
} from "@/lib/mailing/deliverabilityPresets";

interface Props {
  organizationId: string | null;
}

interface SenderRow {
  id: string;
  label: string;
  from_email: string;
  smtp_status: string;
  is_active: boolean;
  warmup_enabled: boolean;
  warmup_daily_target: number;
  warmup_start_count: number;
  warmup_started_at: string | null;
  warmup_paused_reason: string | null;
  warmup_last_run_at: string | null;
}

interface SeedRow {
  id: string;
  label: string;
  email: string;
  provider: DeliverabilityProvider;
  imap_host: string;
  imap_port: number;
  imap_username: string;
  auth_status: string;
  error_category: string | null;
  latency_ms: number | null;
  last_tested_at: string | null;
  last_checked_at: string | null;
  is_active: boolean;
}

interface CheckRow {
  id: string;
  sender_id: string;
  seed_id: string;
  status: string;
  placement: string | null;
  sent_at: string | null;
  checked_at: string | null;
  error_category: string | null;
}

const senderColumns =
  "id,label,from_email,smtp_status,is_active,warmup_enabled,warmup_daily_target,warmup_start_count,warmup_started_at,warmup_paused_reason,warmup_last_run_at";
const seedColumns =
  "id,label,email,provider,imap_host,imap_port,imap_username,auth_status,error_category,latency_ms,last_tested_at,last_checked_at,is_active";

const errorLabel: Record<string, string> = {
  auth: "Ошибка авторизации",
  connection: "Нет соединения",
  tls: "Ошибка TLS",
  timeout: "Тайм-аут",
  config: "Не хватает настроек",
  unknown: "Неизвестная ошибка",
};

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MailingDeliverabilityTab({ organizationId }: Props) {
  const [senders, setSenders] = useState<SenderRow[]>([]);
  const [seeds, setSeeds] = useState<SeedRow[]>([]);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [editingSeedId, setEditingSeedId] = useState<string | null>(null);
  const [seedDraft, setSeedDraft] = useState(emptyDeliverabilitySeedDraft());
  const [savingSeed, setSavingSeed] = useState(false);
  const [testingSeedId, setTestingSeedId] = useState<string | null>(null);
  const [runningSenderId, setRunningSenderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [senderResult, seedResult, checkResult] = await Promise.all([
      supabase
        .from("mailing_senders")
        .select(senderColumns)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("mailing_deliverability_seeds")
        .select(seedColumns)
        .eq("organization_id", organizationId)
        .order("provider", { ascending: true }),
      supabase
        .from("mailing_deliverability_checks")
        .select("id,sender_id,seed_id,status,placement,sent_at,checked_at,error_category")
        .eq("organization_id", organizationId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setLoading(false);
    if (senderResult.error || seedResult.error || checkResult.error) {
      toast.error("Не удалось загрузить данные доставляемости");
      return;
    }
    setSenders((senderResult.data || []) as unknown as SenderRow[]);
    setSeeds((seedResult.data || []) as unknown as SeedRow[]);
    setChecks((checkResult.data || []) as unknown as CheckRow[]);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const verifiedSeeds = useMemo(
    () => seeds.filter((seed) => seed.is_active && seed.auth_status === "ok"),
    [seeds],
  );

  const summary = useMemo(
    () => ({
      sent: checks.filter((check) => check.sent_at).length,
      inbox: checks.filter((check) => check.placement === "inbox").length,
      spam: checks.filter((check) => check.placement === "spam").length,
      missing: checks.filter((check) => check.placement === "missing").length,
      failed: checks.filter((check) => check.status === "failed").length,
      pending: checks.filter((check) => check.status === "sent" && !check.placement).length,
    }),
    [checks],
  );

  const updateSender = async (senderId: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("mailing_senders").update(patch as never).eq("id", senderId);
    if (error) {
      toast.error("Не удалось сохранить настройки прогрева");
      return false;
    }
    await load();
    return true;
  };

  const toggleWarmup = async (sender: SenderRow, enabled: boolean) => {
    if (enabled && sender.smtp_status !== "ok") {
      toast.error("Сначала выполните успешный SMTP-тест отправителя");
      return;
    }
    if (enabled && verifiedSeeds.length === 0) {
      toast.error("Сначала подключите хотя бы один контрольный ящик");
      return;
    }
    const ok = await updateSender(sender.id, {
      warmup_enabled: enabled,
      warmup_started_at: enabled ? sender.warmup_started_at || new Date().toISOString() : sender.warmup_started_at,
      warmup_paused_reason: null,
    });
    if (ok) toast.success(enabled ? "Автопроверка включена" : "Автопроверка приостановлена");
  };

  const saveSeed = async () => {
    if (!organizationId) return;
    const gate = validateDeliverabilitySeedDraft(seedDraft);
    if (!gate.ok) {
      toast.error(gate.reason);
      return;
    }
    setSavingSeed(true);
    const row = toDeliverabilitySeedRow(seedDraft, organizationId);
    const saveQuery = editingSeedId
      ? supabase
          .from("mailing_deliverability_seeds")
          .update(row as never)
          .eq("id", editingSeedId)
          .eq("organization_id", organizationId)
      : supabase.from("mailing_deliverability_seeds").insert(row as never);
    const { data, error } = await saveQuery.select("id").single();
    setSeedDraft((draft) => ({ ...draft, appPassword: "" }));
    if (error || !data) {
      setSavingSeed(false);
      toast.error(error?.code === "23505" ? "Этот контрольный адрес уже добавлен" : "Не удалось сохранить ящик");
      return;
    }

    const seedId = (data as { id: string }).id;
    const { data: testResult, error: testError } = await supabase.functions.invoke(
      "mailing-deliverability-seed-test",
      { body: { seed_id: seedId } },
    );
    setSavingSeed(false);
    setSeedDialogOpen(false);
    setEditingSeedId(null);
    setSeedDraft(emptyDeliverabilitySeedDraft());
    if (testError || !testResult?.success) {
      toast.warning("Ящик сохранён, но IMAP-авторизация не прошла");
    } else {
      toast.success("Контрольный ящик подключён и проверен");
    }
    await load();
  };

  const openNewSeed = () => {
    setEditingSeedId(null);
    setSeedDraft(emptyDeliverabilitySeedDraft());
    setSeedDialogOpen(true);
  };

  const editSeed = (seed: SeedRow) => {
    setEditingSeedId(seed.id);
    setSeedDraft({
      provider: seed.provider,
      label: seed.label,
      email: seed.email,
      imapHost: seed.imap_host,
      imapPort: seed.imap_port,
      imapUsername: seed.imap_username,
      appPassword: "",
    });
    setSeedDialogOpen(true);
  };

  const testSeed = async (seedId: string) => {
    setTestingSeedId(seedId);
    const { data, error } = await supabase.functions.invoke("mailing-deliverability-seed-test", {
      body: { seed_id: seedId },
    });
    setTestingSeedId(null);
    if (error || !data?.success) {
      toast.error(errorLabel[data?.error_category || "unknown"]);
    } else {
      toast.success(`IMAP проверен (${data.latency_ms ?? 0} мс)`);
    }
    await load();
  };

  const runNow = async (sender: SenderRow) => {
    if (!sender.warmup_enabled) {
      toast.error("Сначала включите автопроверку для отправителя");
      return;
    }
    setRunningSenderId(sender.id);
    const { data, error } = await supabase.functions.invoke("mailing-deliverability-worker", {
      body: { sender_id: sender.id, force: true },
    });
    setRunningSenderId(null);
    if (error) {
      toast.error("Воркер проверки не запустился");
    } else if ((data?.sent || 0) > 0) {
      toast.success("Контрольное письмо отправлено. Размещение проверится автоматически.");
    } else {
      toast.info("Новая отправка не требуется: дневной лимит уже выполнен или ящик приостановлен");
    }
    await load();
  };

  const onSeedEmailChange = (email: string) => {
    setSeedDraft((current) => {
      const provider = providerForEmail(email);
      const preset = seedPreset(provider);
      return {
        ...current,
        email,
        provider,
        label: preset.label,
        imapHost: preset.imapHost,
        imapPort: preset.imapPort,
        imapUsername: email,
      };
    });
  };

  return (
    <div className="space-y-4">
      <DomainReputationCheck />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {[
          ["Отправлено", summary.sent],
          ["Входящие", summary.inbox],
          ["Спам", summary.spam],
          ["Не найдено", summary.missing],
          ["Ожидает", summary.pending],
          ["Ошибки", summary.failed],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{loading ? "—" : value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" />
            Автоматический контроль прогрева
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Система начинает с 1 контрольного письма в сутки, ежедневно добавляет по одному и
            распределяет отправки с 09:00 до 20:00 МСК — максимум 10 в день. Она проверяет только
            расположение своих писем через IMAP, не читает содержимое и ничего не перемещает.
          </p>

          {!loading && senders.length === 0 && (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              Сначала добавьте и проверьте SMTP-отправителя.
            </p>
          )}

          {senders.map((sender) => {
            const ownChecks = checks.filter((check) => check.sender_id === sender.id);
            const inboxCount = ownChecks.filter((check) => check.placement === "inbox").length;
            const spamCount = ownChecks.filter((check) => check.placement === "spam").length;
            return (
              <div key={sender.id} className="space-y-3 rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <AtSign className="h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{sender.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{sender.from_email}</p>
                  </div>
                  <Badge variant={sender.smtp_status === "ok" ? "secondary" : "destructive"}>
                    SMTP {sender.smtp_status === "ok" ? "OK" : "не готов"}
                  </Badge>
                  <Switch
                    checked={sender.warmup_enabled}
                    onCheckedChange={(checked) => void toggleWarmup(sender, checked)}
                    aria-label={`Автопроверка ${sender.from_email}`}
                  />
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Цель в сутки</Label>
                    <Select
                      value={String(sender.warmup_daily_target || 10)}
                      onValueChange={(value) =>
                        void updateSender(sender.id, { warmup_daily_target: Number(value) })
                      }
                    >
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[4, 6, 8, 10].map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p>За 7 дней: входящие {inboxCount} · спам {spamCount}</p>
                    <p>Последний запуск: {shortDate(sender.warmup_last_run_at)}</p>
                  </div>
                  <Button
                    className="ml-auto gap-1"
                    variant="outline"
                    onClick={() => void runNow(sender)}
                    disabled={runningSenderId !== null || !sender.warmup_enabled}
                  >
                    {runningSenderId === sender.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Проверить сейчас
                  </Button>
                </div>

                {sender.warmup_paused_reason && (
                  <p className="flex items-center gap-2 text-xs text-orange-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> {sender.warmup_paused_reason}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-primary" />
            Контрольные ящики
          </CardTitle>
          <Button size="sm" className="gap-1" onClick={openNewSeed}>
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Для Gmail, Яндекса и Mail.ru используйте отдельные пароли приложений. Для собственного
            домена допустим пароль ящика, только если провайдер не поддерживает отдельные пароли.
          </p>

          {!loading && seeds.length === 0 && (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              Добавьте Gmail, Яндекс, Mail.ru и собственный контрольный ящик.
            </p>
          )}

          {seeds.map((seed) => (
            <div key={seed.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              {seed.auth_status === "ok" ? (
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{seed.label} — {seed.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {seed.imap_host}:{seed.imap_port} · последняя проверка {shortDate(seed.last_checked_at || seed.last_tested_at)}
                </p>
              </div>
              <Badge variant={seed.auth_status === "ok" ? "secondary" : "outline"}>
                {seed.auth_status === "ok"
                  ? "IMAP OK"
                  : seed.auth_status === "error"
                    ? errorLabel[seed.error_category || "unknown"]
                    : "Не проверен"}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                disabled={testingSeedId !== null}
                onClick={() => void testSeed(seed.id)}
              >
                {testingSeedId === seed.id && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Тест IMAP
              </Button>
              <Button size="sm" variant="ghost" onClick={() => editSeed(seed)}>
                Обновить доступ
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="h-4 w-4 text-primary" />
            Последние проверки
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checks.slice(0, 12).map((check) => {
            const seed = seeds.find((row) => row.id === check.seed_id);
            const status = check.placement || check.status;
            return (
              <div key={check.id} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                {status === "inbox" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : status === "spam" || status === "failed" ? (
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                ) : (
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{seed?.email || "Контрольный ящик"}</span>
                <Badge variant="outline">{status}</Badge>
                <span className="text-xs text-muted-foreground">{shortDate(check.checked_at || check.sent_at)}</span>
              </div>
            );
          })}
          {!loading && checks.length === 0 && (
            <p className="text-sm text-muted-foreground">Контрольных отправок пока не было.</p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={seedDialogOpen}
        onOpenChange={(open) => {
          setSeedDialogOpen(open);
          if (!open) {
            setEditingSeedId(null);
            setSeedDraft(emptyDeliverabilitySeedDraft());
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSeedId ? "Обновить доступ к ящику" : "Контрольный ящик"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Провайдер</Label>
              <Select
                value={seedDraft.provider}
                onValueChange={(value) =>
                  setSeedDraft((draft) =>
                    applyDeliverabilitySeedPreset(draft, value as DeliverabilityProvider),
                  )
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DELIVERABILITY_SEED_PRESETS.map((preset) => (
                    <SelectItem key={preset.key} value={preset.key}>{preset.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{seedPreset(seedDraft.provider).hint}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={seedDraft.email}
                  onChange={(event) => onSeedEmailChange(event.target.value)}
                  placeholder="control@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label>Название</Label>
                <Input
                  value={seedDraft.label}
                  onChange={(event) => setSeedDraft((draft) => ({ ...draft, label: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>IMAP-логин</Label>
                <Input
                  value={seedDraft.imapUsername}
                  onChange={(event) =>
                    setSeedDraft((draft) => ({ ...draft, imapUsername: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>IMAP-хост</Label>
                <Input
                  value={seedDraft.imapHost}
                  onChange={(event) => setSeedDraft((draft) => ({ ...draft, imapHost: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Порт</Label>
                <Input
                  type="number"
                  value={seedDraft.imapPort}
                  onChange={(event) =>
                    setSeedDraft((draft) => ({ ...draft, imapPort: Number(event.target.value) }))
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>
                  {seedDraft.provider === "custom" ? "Пароль ящика или приложения" : "Пароль приложения"}
                </Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={seedDraft.appPassword}
                  onChange={(event) =>
                    setSeedDraft((draft) => ({ ...draft, appPassword: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {seedDraft.provider === "custom"
                    ? "Для Timeweb укажите пароль самого ящика. Секрет сразу шифруется и не возвращается в интерфейс."
                    : "Секрет отправляется один раз, шифруется на сервере и не возвращается в интерфейс."}
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeedDialogOpen(false)}>Отмена</Button>
            <Button onClick={() => void saveSeed()} disabled={savingSeed}>
              {savingSeed && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {editingSeedId ? "Обновить и проверить" : "Сохранить и проверить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
