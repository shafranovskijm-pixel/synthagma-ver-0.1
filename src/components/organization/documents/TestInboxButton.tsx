import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { renderTemplate } from "@/lib/templateRenderer";

interface TestInboxButtonProps {
  organizationId: string;
}

interface TemplateRow {
  id: string;
  name: string;
  body_html: string;
}

const DEFAULT_HTML = `
  <h2>Тестовый документ</h2>
  <p>Это тестовый документ для проверки inbox'а в личном кабинете ученика.</p>
  <p>Если вы видите его в разделе «Документы → Требуют действия» — значит цикл работает корректно.</p>
  <p style="color:#666;font-size:13px">Можно подписать или отклонить — это не повлияет на реальные данные.</p>
`;

export function TestInboxButton({ organizationId }: TestInboxButtonProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [selectedTplId, setSelectedTplId] = useState<string>("__default");
  const [title, setTitle] = useState(`Тестовый документ — ${new Date().toLocaleDateString("ru-RU")}`);
  const [sending, setSending] = useState(false);

  const handleOpen = async (next: boolean) => {
    setOpen(next);
    if (next && templates.length === 0) {
      setLoading(true);
      const { data } = await supabase
        .from("org_contract_templates")
        .select("id, name, body_html")
        .eq("organization_id", organizationId)
        .is("archived_at", null)
        .order("name");
      setTemplates(data || []);
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!user) return;
    setSending(true);
    try {
      const profileRes = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .maybeSingle();

      const recipientName = profileRes.data?.full_name || user.email || "Тестовый получатель";
      const recipientEmail = profileRes.data?.email || user.email || "";

      const tpl = templates.find(t => t.id === selectedTplId);
      const html = tpl
        ? renderTemplate(tpl.body_html, {
            student_name: recipientName,
            student_email: recipientEmail,
            full_name: recipientName,
            email: recipientEmail,
          })
        : DEFAULT_HTML;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);

      const { data: sig, error: sigErr } = await supabase
        .from("document_signatures")
        .insert({
          organization_id: organizationId,
          sender_user_id: user.id,
          recipient_user_id: user.id,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          recipient_type: "student",
          document_type: "test",
          document_title: title.trim() || "Тестовый документ",
          document_html: html,
          status: "sent",
          signature_method: "pep",
          mode: "test",
          expires_at: expiresAt.toISOString(),
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (sigErr) throw sigErr;

      // Создаём первую ревизию (если таблица существует)
      try {
        await supabase.from("signature_revisions" as any).insert({
          signature_id: sig.id,
          version: 1,
          document_html: html,
          created_by: user.id,
        });
      } catch {
        // если таблицы нет — игнорируем
      }

      toast.success("Тестовый документ отправлен", {
        description: "Проверьте кабинет ученика — должен прилететь realtime.",
        action: {
          label: "Открыть мой кабинет",
          onClick: () => window.open("/student?tab=documents", "_blank"),
        },
      });
      setOpen(false);
    } catch (e: any) {
      console.error("[TestInbox]", e);
      toast.error("Не удалось отправить тестовый документ", { description: e.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl gap-1.5"
        onClick={() => handleOpen(true)}
        title="Отправить тестовый документ себе для проверки inbox"
      >
        <FlaskConical className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Тест inbox</span>
      </Button>

      <Dialog open={open} onOpenChange={handleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              Тестовый документ
            </DialogTitle>
            <DialogDescription>
              Документ будет отправлен на ваш собственный аккаунт ({user?.email || "—"}) и появится в разделе «Документы»
              вашего личного кабинета. Письмо при этом не отправляется.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="test-title">Название документа</Label>
              <Input
                id="test-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Тестовый документ"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Шаблон</Label>
              <Select value={selectedTplId} onValueChange={setSelectedTplId} disabled={loading}>
                <SelectTrigger>
                  <SelectValue placeholder={loading ? "Загрузка…" : "Выберите шаблон"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default">Заглушка (без шаблона)</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Если шаблонов нет — будет использован стандартный текст-заглушка.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending}>Отмена</Button>
            <Button onClick={handleSend} disabled={sending || !user}>
              {sending && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
              Отправить себе
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
