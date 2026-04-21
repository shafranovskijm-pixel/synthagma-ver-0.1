import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, Copy, Check, Send, ShoppingBag, Info } from "lucide-react";
import { toast } from "sonner";
import { getBaseUrl } from "@/utils/getBaseUrl";

interface Props {
  organizationId: string;
}

/**
 * Раздел «Витрина и Telegram» в настройках организации:
 *  - Публичная ссылка /o/<slug> со всеми опубликованными курсами школы
 *  - Чат-ID для Telegram-уведомлений о новых заявках/регистрациях с лендинга
 */
export function OrgShowcaseAndTelegramSection({ organizationId }: Props) {
  const [slug, setSlug] = useState<string>("");
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgChatId, setTgChatId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [coursesCount, setCoursesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      setLoading(true);
      const { data: org } = await supabase
        .from("organizations")
        .select("name, public_slug, telegram_notify_enabled, telegram_notify_chat_id")
        .eq("id", organizationId)
        .maybeSingle();
      if (org) {
        setOrgName(org.name || "");
        setSlug(org.public_slug || "");
        setTgEnabled((org as any).telegram_notify_enabled || false);
        setTgChatId((org as any).telegram_notify_chat_id || "");
      }
      const { count } = await supabase
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("is_published", true)
        .eq("hidden_from_catalog", false);
      setCoursesCount(count || 0);
      setLoading(false);
    })();
  }, [organizationId]);

  const showcaseUrl = slug ? `${getBaseUrl()}/o/${slug}` : "";

  const copyUrl = () => {
    if (!showcaseUrl) return;
    navigator.clipboard.writeText(showcaseUrl);
    setCopied(true);
    toast.success("Ссылка скопирована");
    setTimeout(() => setCopied(false), 1500);
  };

  const saveTelegram = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("organizations")
      .update({
        telegram_notify_enabled: tgEnabled,
        telegram_notify_chat_id: tgChatId.trim() || null,
      })
      .eq("id", organizationId);
    setSaving(false);
    if (error) toast.error("Ошибка: " + error.message);
    else toast.success("Настройки Telegram сохранены");
  };

  const sendTest = async () => {
    if (!tgChatId.trim()) {
      toast.error("Сначала укажите chat ID");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-telegram-notification", {
        body: {
          organization_id: organizationId,
          test: true,
          message: `🎉 Тестовое уведомление от Синтагмы. Школа: ${orgName}.`,
        },
      });
      if (error || (data as any)?.error) throw new Error(error?.message || (data as any)?.error);
      toast.success("Сообщение отправлено в Telegram");
    } catch (e: any) {
      toast.error("Не отправлено: " + (e?.message || "проверьте chat ID и подключение бота"));
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground text-sm">Загрузка...</div>;

  return (
    <div className="space-y-6">
      {/* Витрина */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-fuchsia-500" />
            Публичная витрина школы
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Это страница со всеми вашими опубликованными курсами. Поделитесь ссылкой в соцсетях, рекламе или в подписи письма — посетители увидят каталог и смогут перейти к интересующему курсу.
          </p>
          {slug ? (
            <>
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <div className="flex-1 px-3 py-2.5 rounded-xl bg-muted/40 border border-border text-sm font-mono break-all">
                  {showcaseUrl}
                </div>
                <Button variant="outline" onClick={copyUrl} className="rounded-xl gap-2 shrink-0">
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Скопировано" : "Копировать"}
                </Button>
                <Button onClick={() => window.open(showcaseUrl, "_blank")} className="rounded-xl gap-2 shrink-0">
                  <ExternalLink className="w-4 h-4" /> Открыть
                </Button>
              </div>
              <div className="text-xs text-muted-foreground flex items-start gap-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  В каталоге сейчас <b>{coursesCount}</b>{" "}
                  {coursesCount === 1 ? "курс" : coursesCount >= 2 && coursesCount <= 4 ? "курса" : "курсов"}.
                  Чтобы убрать конкретный курс из витрины — включите «Скрыть из каталога» в настройках курса.
                </span>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Ссылка появится после ближайшего сохранения профиля школы — сейчас идёт автогенерация slug.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="w-5 h-5 text-sky-500" />
            Telegram-уведомления о новых заявках
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Получайте мгновенные уведомления о каждой регистрации с лендинга и заявке на курс прямо в Telegram. Это быстрее, чем email — менеджер сможет реагировать в течение пары минут.
          </p>

          <div className="rounded-xl border border-border p-4 bg-muted/30 text-sm space-y-2">
            <p className="font-medium">Как подключить за 1 минуту:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Откройте бота <a href="https://t.me/SintagmaNotificationsBot" target="_blank" rel="noopener noreferrer" className="text-primary underline">@SintagmaNotificationsBot</a> и нажмите «Start»</li>
              <li>Бот пришлёт вам ваш <b>chat ID</b> (число вида 123456789)</li>
              <li>Скопируйте его в поле ниже и сохраните</li>
              <li>Нажмите «Тестовое сообщение» — должно прийти в Telegram</li>
            </ol>
          </div>

          <label className="flex items-center justify-between gap-3 p-3 border rounded-xl">
            <div>
              <div className="text-sm font-medium">Включить уведомления</div>
              <div className="text-xs text-muted-foreground">Когда выключено — заявки приходят только на email</div>
            </div>
            <Switch checked={tgEnabled} onCheckedChange={setTgEnabled} />
          </label>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Chat ID</label>
            <Input
              placeholder="например, 123456789"
              value={tgChatId}
              onChange={(e) => setTgChatId(e.target.value)}
              inputMode="numeric"
              className="rounded-xl font-mono"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={saveTelegram} disabled={saving} className="rounded-xl">
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
            <Button
              variant="outline"
              onClick={sendTest}
              disabled={testing || !tgEnabled || !tgChatId.trim()}
              className="rounded-xl gap-2"
            >
              <Send className="w-3.5 h-3.5" /> {testing ? "Отправка..." : "Тестовое сообщение"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
