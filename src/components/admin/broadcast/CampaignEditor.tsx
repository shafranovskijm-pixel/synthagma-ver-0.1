import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Calendar, Link as LinkIcon, Video, Clock, Save } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { RecipientPicker, RecipientPickerValue } from "./RecipientPicker";
import { WarmupBadge } from "./WarmupBadge";
import { useEmailWarmup } from "@/hooks/useEmailWarmup";
import { CreateWebinarQuick } from "./CreateWebinarQuick";

interface InitialData {
  name?: string;
  subject?: string;
  html?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  scope: "platform" | "org";
  organizationId: string | null;
  onCreated: () => void;
  initial?: InitialData;
}

interface WebinarOption {
  id: string;
  title: string;
  scheduled_at: string;
  public_token: string | null;
}

type MeetingMode = "none" | "external" | "existing" | "new";

interface MeetingMeta {
  url: string;
  title?: string;
  scheduled_at?: string;
  duration_minutes?: number;
}

const DEFAULT_HTML = "<p>Здравствуйте, {{name}}!</p>\n<p>Текст письма...</p>";

const DRAFT_KEY = "broadcast_campaign_draft_v1";

interface DraftData {
  name: string;
  subject: string;
  html: string;
  fromName: string;
  replyTo: string;
  scheduledDate: string;
  scheduledTime: string;
  scope: string;
  organizationId: string | null;
  savedAt: number;
}

export function CampaignEditor({ open, onClose, scope, organizationId, onCreated, initial }: Props) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recipients, setRecipients] = useState<RecipientPickerValue>({
    source: scope === "platform" ? "organizations" : "students",
    manualEmails: [],
    count: 0,
  });

  // Meeting attachment state
  const [meetingMode, setMeetingMode] = useState<MeetingMode>("none");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalDate, setExternalDate] = useState("");
  const [externalTime, setExternalTime] = useState("");
  const [hostName, setHostName] = useState("Команда Sintagma");
  const [attachIcs, setAttachIcs] = useState(true);
  const [webinars, setWebinars] = useState<WebinarOption[]>([]);
  const [selectedWebinarId, setSelectedWebinarId] = useState<string>("");
  const [createWebinarOpen, setCreateWebinarOpen] = useState(false);
  const [newWebinarMeta, setNewWebinarMeta] = useState<MeetingMeta | null>(null);

  // Scheduling
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);

  const scopeKey = scope === "platform" ? "platform" : (organizationId || "");
  const { status: warmup } = useEmailWarmup(scopeKey || null);
  const tooMany = warmup && recipients.count > warmup.remaining;

  // Apply initial data when dialog opens
  useEffect(() => {
    if (open && initial) {
      if (initial.name) setName(initial.name);
      if (initial.subject) setSubject(initial.subject);
      if (initial.html) setHtml(initial.html);
    }
  }, [open, initial]);

  // Restore draft from localStorage when dialog opens (only if no initial data)
  useEffect(() => {
    if (!open || initial || draftRestored) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft: DraftData = JSON.parse(raw);
      // Match scope/org and not older than 7 days
      if (
        draft.scope !== scope ||
        draft.organizationId !== organizationId ||
        Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000
      ) return;
      // Only restore if there's meaningful content
      if (!draft.name && !draft.subject && draft.html === DEFAULT_HTML) return;
      setName(draft.name || "");
      setSubject(draft.subject || "");
      setHtml(draft.html || DEFAULT_HTML);
      setFromName(draft.fromName || "");
      setReplyTo(draft.replyTo || "");
      if (draft.scheduledDate) {
        setScheduleEnabled(true);
        setScheduledDate(draft.scheduledDate);
        setScheduledTime(draft.scheduledTime || "");
      }
      setDraftRestored(true);
      toast.info("Восстановлен черновик кампании");
    } catch { /* ignore */ }
  }, [open, initial, scope, organizationId, draftRestored]);

  // Auto-save draft to localStorage (debounced)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        const draft: DraftData = {
          name, subject, html, fromName, replyTo,
          scheduledDate, scheduledTime,
          scope, organizationId, savedAt: Date.now(),
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch { /* ignore quota */ }
    }, 800);
    return () => clearTimeout(t);
  }, [open, name, subject, html, fromName, replyTo, scheduledDate, scheduledTime, scope, organizationId]);

  // Load existing webinars when "existing" mode chosen
  useEffect(() => {
    if (meetingMode !== "existing") return;
    (async () => {
      const { data } = await supabase
        .from("webinars")
        .select("id, title, scheduled_at, public_token")
        .in("status", ["scheduled", "live"])
        .order("scheduled_at", { ascending: true })
        .limit(50);
      setWebinars((data || []) as WebinarOption[]);
    })();
  }, [meetingMode]);

  const computeMeeting = (): MeetingMeta | null => {
    if (meetingMode === "external") {
      if (!externalUrl.trim()) return null;
      const sched = externalDate && externalTime
        ? new Date(`${externalDate}T${externalTime}:00`).toISOString()
        : undefined;
      return { url: externalUrl.trim(), scheduled_at: sched };
    }
    if (meetingMode === "existing") {
      const w = webinars.find(w => w.id === selectedWebinarId);
      if (!w || !w.public_token) return null;
      return {
        url: `${window.location.origin}/w/${w.public_token}`,
        title: w.title,
        scheduled_at: w.scheduled_at,
        duration_minutes: 60,
      };
    }
    if (meetingMode === "new" && newWebinarMeta) {
      return newWebinarMeta;
    }
    return null;
  };

  const meeting = computeMeeting();

  const reset = () => {
    setName(""); setSubject(""); setHtml(DEFAULT_HTML);
    setFromName(""); setReplyTo(""); setConsent(false);
    setMeetingMode("none"); setExternalUrl(""); setExternalDate(""); setExternalTime("");
    setSelectedWebinarId(""); setNewWebinarMeta(null);
    setScheduleEnabled(false); setScheduledDate(""); setScheduledTime("");
    setRecipients({ source: scope === "platform" ? "organizations" : "students", manualEmails: [], count: 0 });
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const renderPreview = () => {
    let preview = html;
    preview = preview.replace(/\{\{name\}\}/g, "Иван Иванов")
      .replace(/\{\{email\}\}/g, "ivan@example.com")
      .replace(/\{\{host_name\}\}/g, hostName || "Команда Sintagma");
    if (meeting) {
      const d = meeting.scheduled_at ? new Date(meeting.scheduled_at) : null;
      preview = preview
        .replace(/\{\{webinar_url\}\}/g, meeting.url)
        .replace(/\{\{date\}\}/g, d ? format(d, "d MMMM yyyy", { locale: ru }) : "")
        .replace(/\{\{time\}\}/g, d ? format(d, "HH:mm") : "");
    }
    return preview;
  };

  const handleSave = async (launch: boolean) => {
    if (!name.trim() || !subject.trim() || !html.trim()) {
      toast.error("Заполните название, тему и тело письма");
      return;
    }
    if (recipients.count === 0) {
      toast.error("Получателей не найдено");
      return;
    }
    if (!consent) {
      toast.error("Подтвердите согласие получателей");
      return;
    }
    // Базовая валидация HTML — баланс <p>/<div>/<a>
    const openTags = (html.match(/<(p|div|a|span|table|tr|td)\b/gi) || []).length;
    const closeTags = (html.match(/<\/(p|div|a|span|table|tr|td)>/gi) || []).length;
    if (Math.abs(openTags - closeTags) > 2) {
      const ok = confirm("В HTML обнаружены несбалансированные теги. Письмо может отображаться некорректно. Продолжить?");
      if (!ok) return;
    }

    let scheduledAtISO: string | null = null;
    if (scheduleEnabled) {
      if (!scheduledDate || !scheduledTime) {
        toast.error("Укажите дату и время отправки");
        return;
      }
      const dt = new Date(`${scheduledDate}T${scheduledTime}:00`);
      if (isNaN(dt.getTime())) {
        toast.error("Некорректные дата/время");
        return;
      }
      if (dt.getTime() < Date.now() + 30_000) {
        toast.error("Дата отправки должна быть в будущем (минимум +30 сек)");
        return;
      }
      scheduledAtISO = dt.toISOString();
    }

    setSaving(true);
    try {
      const meta = meeting;
      const recipientFilter: any = {};
      if (meta) {
        recipientFilter.meeting = {
          url: meta.url,
          title: meta.title || null,
          scheduled_at: meta.scheduled_at || null,
          duration_minutes: meta.duration_minutes || 60,
          host_name: hostName.trim() || null,
          attach_ics: attachIcs,
        };
      }

      const isScheduled = !launch && !!scheduledAtISO;
      const payload: any = {
        scope,
        organization_id: scope === "org" ? organizationId : null,
        name: name.trim(),
        subject: subject.trim(),
        html_body: html,
        from_name: fromName.trim() || null,
        reply_to: replyTo.trim() || null,
        recipient_source: recipients.source,
        manual_emails: recipients.source === "manual" ? recipients.manualEmails : null,
        recipient_filter: Object.keys(recipientFilter).length ? recipientFilter : null,
        scheduled_at: scheduledAtISO,
        status: isScheduled ? "scheduled" : "draft",
      };
      const { data: user } = await supabase.auth.getUser();
      if (user?.user) payload.created_by = user.user.id;

      const { data, error } = await supabase.from("email_campaigns").insert(payload).select("id").single();
      if (error) throw error;

      if (isScheduled) {
        toast.success(`Кампания запланирована на ${format(new Date(scheduledAtISO!), "d MMM, HH:mm", { locale: ru })}`);
      } else {
        toast.success("Кампания создана");
      }

      if (launch && data) {
        const { data: runRes, error: runErr } = await supabase.functions.invoke("run-email-campaign", {
          body: { campaignId: data.id },
        });
        if (runErr) throw runErr;
        if (runRes?.error) throw new Error(runRes.error);
        toast.success("Кампания запущена");
      }
      reset();
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новая email-кампания</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {scopeKey && <WarmupBadge scopeKey={scopeKey} />}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Название кампании (только для вас)</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Промо 22.04" />
              </div>
              <div>
                <Label>Имя отправителя</Label>
                <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Команда Sintagma" />
              </div>
            </div>

            <div>
              <Label>Тема письма</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Здравствуйте, {{name}}!" />
              <p className="text-xs text-muted-foreground mt-1">
                Переменные: <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>, <code>{"{{date}}"}</code>, <code>{"{{time}}"}</code>, <code>{"{{webinar_url}}"}</code>, <code>{"{{host_name}}"}</code>
              </p>
            </div>

            <div>
              <Label>Reply-to (необязательно)</Label>
              <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="info@example.ru" />
            </div>

            {/* Meeting attachment widget */}
            <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
              <div className="flex items-center gap-2">
                <Video className="w-4 h-4 text-primary" />
                <Label className="text-sm font-semibold">Ссылка на встречу (необязательно)</Label>
              </div>

              <RadioGroup value={meetingMode} onValueChange={(v) => setMeetingMode(v as MeetingMode)} className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-background cursor-pointer">
                  <RadioGroupItem value="none" id="mm-none" />
                  <span className="text-sm">Не прикреплять</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-background cursor-pointer">
                  <RadioGroupItem value="external" id="mm-ext" />
                  <LinkIcon className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm">Внешняя ссылка</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-background cursor-pointer">
                  <RadioGroupItem value="existing" id="mm-exist" />
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm">Существующий вебинар</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg hover:bg-background cursor-pointer">
                  <RadioGroupItem value="new" id="mm-new" />
                  <Plus className="w-3 h-3 text-muted-foreground" />
                  <span className="text-sm">Создать новый вебинар</span>
                </label>
              </RadioGroup>

              {meetingMode === "external" && (
                <div className="space-y-2 pt-1">
                  <Input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    placeholder="https://zoom.us/j/123... или https://meet.google.com/..."
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="date" value={externalDate} onChange={(e) => setExternalDate(e.target.value)} />
                    <Input type="time" value={externalTime} onChange={(e) => setExternalTime(e.target.value)} />
                  </div>
                </div>
              )}

              {meetingMode === "existing" && (
                <div className="pt-1">
                  {webinars.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Нет запланированных вебинаров. Создайте новый.</p>
                  ) : (
                    <Select value={selectedWebinarId} onValueChange={setSelectedWebinarId}>
                      <SelectTrigger><SelectValue placeholder="Выберите вебинар" /></SelectTrigger>
                      <SelectContent>
                        {webinars.map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.title} — {format(new Date(w.scheduled_at), "d MMM, HH:mm", { locale: ru })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {meetingMode === "new" && (
                <div className="pt-1">
                  {newWebinarMeta ? (
                    <div className="text-xs space-y-1">
                      <p className="text-muted-foreground">Создан вебинар:</p>
                      <p className="font-medium">{newWebinarMeta.title}</p>
                      <p className="text-primary truncate">{newWebinarMeta.url}</p>
                      <Button size="sm" variant="ghost" onClick={() => setNewWebinarMeta(null)}>
                        Создать другой
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setCreateWebinarOpen(true)} className="gap-1">
                      <Plus className="w-3 h-3" /> Создать вебинар
                    </Button>
                  )}
                </div>
              )}

              {meeting && (
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div>
                    <Label className="text-xs">Имя ведущего (для подписи письма)</Label>
                    <Input value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder="Команда Sintagma" />
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={attachIcs} onCheckedChange={(v) => setAttachIcs(!!v)} />
                    <span>Прикрепить .ics (приглашение в календарь)</span>
                  </label>
                </div>
              )}
            </div>

            <div>
              <Label>Тело письма (HTML)</Label>
              <Tabs defaultValue="html">
                <TabsList>
                  <TabsTrigger value="html">HTML</TabsTrigger>
                  <TabsTrigger value="preview">Предпросмотр</TabsTrigger>
                </TabsList>
                <TabsContent value="html">
                  <Textarea
                    rows={12}
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    className="font-mono text-xs"
                  />
                </TabsContent>
                <TabsContent value="preview">
                  <div
                    className="border rounded-lg p-4 bg-background min-h-[200px] prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: renderPreview() }}
                  />
                </TabsContent>
              </Tabs>
            </div>

            <RecipientPicker
              scope={scope}
              organizationId={organizationId}
              value={recipients}
              onChange={setRecipients}
            />

            {tooMany && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm">
                На сегодня доступно <b>{warmup.remaining}</b> писем (день {warmup.day} прогрева, лимит {warmup.daily_limit}/день).
                Выбрано {recipients.count}. Уменьшите список или разделите на несколько дней.
              </div>
            )}

            {/* Scheduling */}
            <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <Checkbox checked={scheduleEnabled} onCheckedChange={(v) => setScheduleEnabled(!!v)} />
                <Clock className="w-4 h-4 text-primary" />
                <span>Запланировать отправку</span>
              </label>
              {scheduleEnabled && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Дата</Label>
                    <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Время</Label>
                    <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
                  </div>
                  <p className="col-span-2 text-xs text-muted-foreground">
                    Кампания будет автоматически запущена в указанное время. Локальная зона: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                  </p>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
              <span>У меня есть согласие получателей на email-рассылки</span>
            </label>

            {draftRestored && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Save className="w-3 h-3" /> Черновик автоматически сохраняется
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
            <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
              {scheduleEnabled ? "Запланировать" : "Сохранить как черновик"}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving || !!tooMany || recipients.count === 0 || !consent || scheduleEnabled}>
              {saving ? "Создание..." : `Запустить сейчас (${recipients.count})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateWebinarQuick
        open={createWebinarOpen}
        onClose={() => setCreateWebinarOpen(false)}
        onCreated={(w) => {
          setNewWebinarMeta({ url: w.url, title: w.title, scheduled_at: w.scheduled_at, duration_minutes: 60 });
        }}
      />
    </>
  );
}
