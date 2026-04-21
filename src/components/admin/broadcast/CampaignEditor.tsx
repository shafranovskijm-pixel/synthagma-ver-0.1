import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RecipientPicker, RecipientPickerValue } from "./RecipientPicker";
import { WarmupBadge } from "./WarmupBadge";
import { useEmailWarmup } from "@/hooks/useEmailWarmup";

interface Props {
  open: boolean;
  onClose: () => void;
  scope: "platform" | "org";
  organizationId: string | null;
  onCreated: () => void;
}

export function CampaignEditor({ open, onClose, scope, organizationId, onCreated }: Props) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("<p>Здравствуйте, {{name}}!</p>\n<p>Текст письма...</p>");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recipients, setRecipients] = useState<RecipientPickerValue>({
    source: scope === "platform" ? "organizations" : "students",
    manualEmails: [],
    count: 0,
  });

  const scopeKey = scope === "platform" ? "platform" : (organizationId || "");
  const { status: warmup } = useEmailWarmup(scopeKey || null);

  const tooMany = warmup && recipients.count > warmup.remaining;

  const reset = () => {
    setName(""); setSubject(""); setHtml("<p>Здравствуйте, {{name}}!</p>\n<p>Текст письма...</p>");
    setFromName(""); setReplyTo(""); setConsent(false);
    setRecipients({ source: scope === "platform" ? "organizations" : "students", manualEmails: [], count: 0 });
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
    setSaving(true);
    try {
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
        status: "draft",
      };
      const { data: user } = await supabase.auth.getUser();
      if (user?.user) payload.created_by = user.user.id;

      const { data, error } = await supabase.from("email_campaigns").insert(payload).select("id").single();
      if (error) throw error;
      toast.success("Кампания создана");

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
              Поддерживаются переменные: <code>{"{{name}}"}</code>, <code>{"{{email}}"}</code>
            </p>
          </div>

          <div>
            <Label>Reply-to (необязательно)</Label>
            <Input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="info@example.ru" />
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
                  dangerouslySetInnerHTML={{ __html: html.replace(/\{\{name\}\}/g, "Иван Иванов").replace(/\{\{email\}\}/g, "ivan@example.com") }}
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

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
            <span>У меня есть согласие получателей на email-рассылки</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
            Сохранить как черновик
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving || tooMany || recipients.count === 0 || !consent}>
            {saving ? "Создание..." : `Запустить (${recipients.count})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
