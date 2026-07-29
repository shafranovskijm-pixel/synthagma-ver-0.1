import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CheckCircle2, AlertCircle, Mail, TestTube2, ShieldCheck } from "lucide-react";
import { useOrgSmtp } from "@/hooks/useOrgSmtp";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Props {
  organizationId: string;
}

export function OrgSmtpSettings({ organizationId }: Props) {
  const { settings, loading, loaded, loadErrorKind, retryLoad, save, saving, testConnection, testing } = useOrgSmtp(organizationId);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(587);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [fromName, setFromName] = useState("");
  const [encryption, setEncryption] = useState("tls");
  const [dailyLimit, setDailyLimit] = useState(50);
  const [safeWarmup, setSafeWarmup] = useState(true);

  useEffect(() => {
    if (settings) {
      setHost(settings.host);
      setPort(settings.port);
      setUsername(settings.username);
      setFromEmail(settings.from_email);
      setFromName(settings.from_name || "");
      setEncryption(settings.encryption);
      setDailyLimit(settings.provider_daily_limit ?? 50);
      setSafeWarmup(settings.safe_warmup_enabled ?? true);
    }
  }, [settings]);

  const handleSave = async () => {
    await save({
      host, port, username, password,
      from_email: fromEmail, from_name: fromName, encryption,
      provider_daily_limit: dailyLimit,
      safe_warmup_enabled: safeWarmup,
    });
    setPassword("");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Загрузка SMTP-настроек...</p>;

  return (
    <div className="space-y-4">
      {!settings && (
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-orange-600 font-medium">
              <Mail className="w-4 h-4" /> SMTP не настроен
            </div>
            <p className="text-sm text-muted-foreground">
              Чтобы запускать email-рассылки от имени вашего домена, подключите свой SMTP-сервер.
              Рекомендуем: Yandex 360 (Бизнес), Mail.ru для бизнеса, Timeweb, Beget.
            </p>
            <p className="text-xs text-muted-foreground">
              ⚠️ Начните с прогрева — первые дни лимит небольшой (10 → 20 → 30 → 40 → 50), это снижает риск попасть в спам.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>SMTP-настройки</span>
            {settings?.is_verified && (
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Проверено
              </Badge>
            )}
            {settings && !settings.is_verified && settings.last_test_at && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                <AlertCircle className="w-3 h-3 mr-1" /> Ошибка
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>SMTP-хост</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.yandex.ru" />
            </div>
            <div>
              <Label>Порт</Label>
              <Input type="number" value={port} onChange={(e) => setPort(parseInt(e.target.value) || 587)} />
            </div>
            <div>
              <Label>Логин (обычно email)</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="noreply@example.ru" />
            </div>
            <div>
              <Label>Пароль {settings ? "(оставьте пустым, чтобы не менять)" : ""}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <div>
              <Label>Email отправителя (From)</Label>
              <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="noreply@example.ru" />
            </div>
            <div>
              <Label>Имя отправителя</Label>
              <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Школа Иван и Ко" />
            </div>
            <div>
              <Label>Шифрование</Label>
              <Select value={encryption} onValueChange={setEncryption}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">STARTTLS (порт 587)</SelectItem>
                  <SelectItem value="ssl">SSL/TLS (порт 465)</SelectItem>
                  <SelectItem value="none">Без шифрования (не рекомендуется)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Лимит писем в сутки (1–50)</Label>
              <Select value={String(dailyLimit)} onValueChange={(v) => setDailyLimit(parseInt(v, 10))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="40">40</SelectItem>
                  <SelectItem value="50">50 (максимум)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Больше 50 писем в сутки с одного адреса не допускается — это защита от спам-фильтров.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/40">
            <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="safe-warmup" className="font-medium cursor-pointer">
                  Безопасный прогрев — рекомендуется
                </Label>
                <Switch id="safe-warmup" checked={safeWarmup} onCheckedChange={setSafeWarmup} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {safeWarmup
                  ? "Прогрев постепенно увеличивает лимит: 10, 20, 30, 40 и до 50 писем в сутки."
                  : "Можно отправлять до выбранного лимита сразу, но не более 50 писем в сутки."}
              </p>
            </div>
          </div>

          {settings?.last_test_error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
              <b>Последняя ошибка:</b> {settings.last_test_error}
              {settings.last_test_at && (
                <p className="text-muted-foreground mt-1">
                  {format(new Date(settings.last_test_at), "d MMM yyyy HH:mm", { locale: ru })}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving || !host || !username || !fromEmail || (!settings && !password)}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
            {settings && (
              <Button variant="outline" onClick={testConnection} disabled={testing} className="gap-2">
                <TestTube2 className="w-4 h-4" />
                {testing ? "Проверка..." : "Тест соединения"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
