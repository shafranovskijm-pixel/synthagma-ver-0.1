import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Send, Trash2, Mail, Clock, MessageSquare, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { ru } from "date-fns/locale";

interface Announcement {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  created_by: string | null;
}

interface OrgForMailing {
  id: string;
  name: string;
  email: string | null;
  updated_at: string;
  daysInactive: number;
}

interface EmailToken {
  id: string;
  organization_id: string;
  organization_email: string;
  action_type: string;
  template_name: string;
  used: boolean;
  created_at: string;
  used_at: string | null;
}

type TemplateType = "inactive" | "welcome" | null;

export function BroadcastManager() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // Email mailing state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>(null);
  const [organizations, setOrganizations] = useState<OrgForMailing[]>([]);
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [inactivityDays, setInactivityDays] = useState("30");
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [sendingEmails, setSendingEmails] = useState(false);
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0 });
  const [emailHistory, setEmailHistory] = useState<EmailToken[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from("platform_announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setAnnouncements(data);
    setLoading(false);
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  // Load organizations when template selected
  useEffect(() => {
    if (selectedTemplate) {
      loadOrganizations();
      loadEmailHistory();
    }
  }, [selectedTemplate, inactivityDays]);

  const loadOrganizations = async () => {
    setLoadingOrgs(true);
    const { data } = await supabase
      .from("organizations")
      .select("id, name, email, updated_at")
      .order("name");

    if (data) {
      const now = new Date();
      const orgs: OrgForMailing[] = data
        .filter(o => o.email)
        .map(o => ({
          ...o,
          daysInactive: differenceInDays(now, new Date(o.updated_at)),
        }));

      if (selectedTemplate === "inactive") {
        const threshold = parseInt(inactivityDays);
        setOrganizations(orgs.filter(o => o.daysInactive >= threshold));
      } else {
        setOrganizations(orgs);
      }
    }
    setSelectedOrgIds(new Set());
    setLoadingOrgs(false);
  };

  const loadEmailHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from("email_action_tokens")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setEmailHistory(data as EmailToken[]);
    setLoadingHistory(false);
  };

  const handleSend = async () => {
    if (!content.trim()) {
      toast.error("Введите текст сообщения");
      return;
    }
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("platform_announcements").insert({
        title: title.trim() || null,
        content: content.trim(),
        created_by: user?.id || null,
      });
      if (error) throw error;
      toast.success("Рассылка отправлена");
      setTitle("");
      setContent("");
      fetchAnnouncements();
    } catch (err: any) {
      toast.error("Ошибка: " + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("platform_announcements").delete().eq("id", id);
    if (error) {
      toast.error("Ошибка удаления");
    } else {
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      toast.success("Удалено");
    }
  };

  const toggleOrg = (id: string) => {
    setSelectedOrgIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedOrgIds.size === organizations.length) {
      setSelectedOrgIds(new Set());
    } else {
      setSelectedOrgIds(new Set(organizations.map(o => o.id)));
    }
  };

  const getEmailHtml = (orgName: string, actionUrl: string) => {
    if (selectedTemplate === "inactive") {
      return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
            <h1 style="font-size: 22px; color: #1a1a1a; margin: 0 0 20px;">Здравствуйте!</h1>
            <p style="font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 16px;">
              Мы заметили, что вы давно не заходили на платформу <strong>Sintagma</strong>.
            </p>
            <p style="font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 16px;">
              Если вам нужна помощь в настройке или консультация по работе с платформой — мы с радостью поможем! Нажмите кнопку ниже, и мы свяжемся с вами.
            </p>
            <p style="font-size: 14px; color: #888; line-height: 1.6; margin: 0 0 28px;">
              Если платформа вам больше не нужна, ваш аккаунт может быть деактивирован через 30 дней.
            </p>
            <div style="text-align: center;">
              <a href="${actionUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
                Мне нужна помощь
              </a>
            </div>
            <p style="font-size: 12px; color: #aaa; margin: 28px 0 0; text-align: center;">
              Платформа Sintagma — sintagma.com.ru
            </p>
          </div>
        </div>
      `;
    }
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: white; border-radius: 16px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
          <h1 style="font-size: 22px; color: #1a1a1a; margin: 0 0 20px;">Добро пожаловать!</h1>
          <p style="font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 16px;">
            Спасибо за регистрацию на платформе <strong>Sintagma</strong>!
          </p>
          <p style="font-size: 15px; color: #555; line-height: 1.7; margin: 0 0 28px;">
            Если вам нужна консультация по настройке платформы или у вас есть вопросы — нажмите кнопку ниже, и мы свяжемся с вами.
          </p>
          <div style="text-align: center;">
            <a href="${actionUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Запросить консультацию
            </a>
          </div>
          <p style="font-size: 12px; color: #aaa; margin: 28px 0 0; text-align: center;">
            Платформа Sintagma — sintagma.com.ru
          </p>
        </div>
      </div>
    `;
  };

  const handleSendEmails = async () => {
    if (selectedOrgIds.size === 0) {
      toast.error("Выберите хотя бы одну организацию");
      return;
    }

    const selectedOrgs = organizations.filter(o => selectedOrgIds.has(o.id));
    setSendingEmails(true);
    setSendProgress({ current: 0, total: selectedOrgs.length });

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    let successCount = 0;
    let failCount = 0;

    for (const org of selectedOrgs) {
      try {
        // Create token
        const actionType = selectedTemplate === "inactive" ? "help_request" : "consultation_request";
        const { data: tokenData, error: tokenError } = await supabase
          .from("email_action_tokens")
          .insert({
            organization_id: org.id,
            organization_email: org.email!,
            action_type: actionType,
            template_name: selectedTemplate!,
          })
          .select("id")
          .single();

        if (tokenError || !tokenData) {
          failCount++;
          setSendProgress(p => ({ ...p, current: p.current + 1 }));
          continue;
        }

        const publishedUrl = "https://sintagma.com.ru";
        const actionUrl = `${publishedUrl}/email-response?token=${tokenData.id}`;
        const html = getEmailHtml(org.name, actionUrl);
        const subject = selectedTemplate === "inactive"
          ? "Мы заметили, что вы давно не заходили — Sintagma"
          : "Добро пожаловать на платформу Sintagma!";

        await supabase.functions.invoke("send-email", {
          body: {
            to: org.email,
            subject,
            html,
            from: "Sintagma <support@sintagma.com.ru>",
          },
        });

        successCount++;
      } catch (err) {
        console.error("Error sending to", org.email, err);
        failCount++;
      }
      setSendProgress(p => ({ ...p, current: p.current + 1 }));
    }

    setSendingEmails(false);
    if (failCount === 0) {
      toast.success(`Отправлено: ${successCount} писем`);
    } else {
      toast.warning(`Отправлено: ${successCount}, ошибок: ${failCount}`);
    }
    loadEmailHistory();
  };

  return (
    <div className="space-y-6">
      {/* Original announcements section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            Новая рассылка (уведомления)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Заголовок (необязательно)"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <Textarea
            placeholder="Текст сообщения для всех организаций..."
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
          />
          <Button onClick={handleSend} disabled={sending || !content.trim()} className="gap-2">
            <Send className="w-4 h-4" />
            {sending ? "Отправка..." : "Отправить всем"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История рассылок</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Загрузка...</p>
          ) : announcements.length === 0 ? (
            <p className="text-muted-foreground text-sm">Рассылок пока нет</p>
          ) : (
            <div className="space-y-3">
              {announcements.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
                  <Megaphone className="w-4 h-4 text-primary shrink-0 mt-1" />
                  <div className="flex-1 min-w-0">
                    {a.title && <p className="font-medium text-sm">{a.title}</p>}
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {format(new Date(a.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)} className="shrink-0">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email mailing section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email-рассылка организациям
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Выберите шаблон письма. Организации получат email с кнопкой — при нажатии вам придёт уведомление в чат и Telegram.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              onClick={() => setSelectedTemplate(selectedTemplate === "inactive" ? null : "inactive")}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedTemplate === "inactive"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange-500" />
                <span className="font-medium text-sm">Неактивная организация</span>
              </div>
              <p className="text-xs text-muted-foreground">
                «Вы давно не заходили на платформу. Нужна помощь?»
              </p>
            </button>

            <button
              onClick={() => setSelectedTemplate(selectedTemplate === "welcome" ? null : "welcome")}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedTemplate === "welcome"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-sm">Приветствие / консультация</span>
              </div>
              <p className="text-xs text-muted-foreground">
                «Спасибо за регистрацию! Нужна консультация?»
              </p>
            </button>
          </div>

          {selectedTemplate && (
            <div className="space-y-4 pt-2">
              {selectedTemplate === "inactive" && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">Не заходили более:</span>
                  <Select value={inactivityDays} onValueChange={setInactivityDays}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 дней</SelectItem>
                      <SelectItem value="14">14 дней</SelectItem>
                      <SelectItem value="30">30 дней</SelectItem>
                      <SelectItem value="60">60 дней</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {loadingOrgs ? (
                <p className="text-sm text-muted-foreground">Загрузка организаций...</p>
              ) : organizations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {selectedTemplate === "inactive"
                    ? "Нет организаций, неактивных более " + inactivityDays + " дней"
                    : "Нет организаций с указанным email"}
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={toggleAll}>
                      {selectedOrgIds.size === organizations.length ? "Снять выделение" : "Выбрать всех"}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Выбрано: {selectedOrgIds.size} из {organizations.length}
                    </span>
                  </div>

                  <div className="max-h-[300px] overflow-y-auto space-y-1 border rounded-lg p-2">
                    {organizations.map(org => (
                      <label
                        key={org.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedOrgIds.has(org.id)}
                          onCheckedChange={() => toggleOrg(org.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{org.name}</p>
                          <p className="text-xs text-muted-foreground">{org.email}</p>
                        </div>
                        {selectedTemplate === "inactive" && (
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {org.daysInactive} дн.
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>

                  <Button
                    onClick={handleSendEmails}
                    disabled={sendingEmails || selectedOrgIds.size === 0}
                    className="gap-2 w-full"
                  >
                    {sendingEmails ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Отправка {sendProgress.current}/{sendProgress.total}...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Отправить ({selectedOrgIds.size})
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email history */}
      {emailHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="w-4 h-4" />
              История email-рассылок
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <p className="text-sm text-muted-foreground">Загрузка...</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {emailHistory.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                    {t.used ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{t.organization_email}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.template_name === "inactive" ? "Неактивная" : "Приветствие"} •{" "}
                        {format(new Date(t.created_at), "d MMM yyyy, HH:mm", { locale: ru })}
                      </p>
                    </div>
                    {t.used && (
                      <Badge className="bg-green-500/10 text-green-600 border-green-200 text-xs">
                        Нажал кнопку
                        {t.used_at && (
                          <> • {format(new Date(t.used_at), "d MMM, HH:mm", { locale: ru })}</>
                        )}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
