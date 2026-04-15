import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CreditCard, Save, Eye, EyeOff, CheckCircle2, XCircle, Copy } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  organizationId: string;
}

export function TBankSettings({ organizationId }: Props) {
  const [terminalKey, setTerminalKey] = useState("");
  const [password, setPassword] = useState("");
  const [isTestMode, setIsTestMode] = useState(true);
  const [paymentMode, setPaymentMode] = useState<"redirect" | "widget">("redirect");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [organizationId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("organization_payment_settings")
        .select("terminal_key, is_test_mode, payment_mode" as any)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (data) {
        setTerminalKey((data as any).terminal_key || "");
        setIsTestMode((data as any).is_test_mode);
        setPaymentMode((data as any).payment_mode || "redirect");
        setHasExisting(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        organization_id: organizationId,
        terminal_key: terminalKey,
        is_test_mode: isTestMode,
        payment_mode: paymentMode,
      };

      if (password) payload.password_encrypted = password;

      if (hasExisting) {
        const { error } = await supabase
          .from("organization_payment_settings")
          .update(payload)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        if (!password) {
          toast.error("Введите пароль терминала");
          setSaving(false);
          return;
        }
        const { error } = await supabase
          .from("organization_payment_settings")
          .insert(payload);
        if (error) throw error;
        setHasExisting(true);
      }

      setPassword("");
      toast.success("Настройки Т-Банк сохранены");
    } catch (err) {
      console.error(err);
      toast.error("Ошибка сохранения настроек");
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><SigmaSpinner size="sm" />Загрузка...</div>;
  }

  const isConnected = hasExisting && !!terminalKey;

  return (
    <div className="space-y-6">
      {/* Connection status */}
      <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2">
            <CreditCard className="w-4 h-4 lg:w-5 lg:h-5" />
            Настройки Т-Банк Эквайринг
          </h3>
          <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center gap-1.5">
            {isConnected ? (
              <><CheckCircle2 className="w-3.5 h-3.5" /> Подключено</>
            ) : (
              <><XCircle className="w-3.5 h-3.5" /> Не настроено</>
            )}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Подключите интернет-эквайринг Т-Банк для приёма оплат за курсы. Данные из вашего личного кабинета Т-Банк Бизнес.
        </p>

        <div className="space-y-4 max-w-md">
          <div>
            <Label htmlFor="terminal-key">TerminalKey</Label>
            <Input
              id="terminal-key"
              value={terminalKey}
              onChange={e => setTerminalKey(e.target.value)}
              placeholder="Ваш ключ терминала"
            />
          </div>

          <div>
            <Label htmlFor="tbank-password">Пароль терминала</Label>
            <div className="relative">
              <Input
                id="tbank-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={hasExisting ? "••••••• (не изменён)" : "Пароль"}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={isTestMode} onCheckedChange={setIsTestMode} id="test-mode" />
            <Label htmlFor="test-mode" className="cursor-pointer">Тестовый режим</Label>
          </div>

          {/* Payment mode */}
          <div className="space-y-2">
            <Label>Режим оплаты</Label>
            <RadioGroup value={paymentMode} onValueChange={(v) => setPaymentMode(v as "redirect" | "widget")} className="space-y-2">
              <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <RadioGroupItem value="redirect" id="mode-redirect" className="mt-0.5" />
                <div>
                  <Label htmlFor="mode-redirect" className="font-medium cursor-pointer">Редирект</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Перенаправление на платёжную страницу Т-Банк</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <RadioGroupItem value="widget" id="mode-widget" className="mt-0.5" />
                <div>
                  <Label htmlFor="mode-widget" className="font-medium cursor-pointer">Встроенный виджет</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">Модальное окно оплаты прямо на сайте (T-Bank Payment SDK)</p>
                </div>
              </div>
            </RadioGroup>
          </div>

          <Button onClick={handleSave} disabled={saving || !terminalKey}>
            {saving ? <SigmaSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Сохранить
          </Button>
        </div>
      </div>

      {/* Test card data */}
      {isTestMode && (
        <Card className="border-dashed border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-6">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-500" />
              Тестовые данные карты
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Используйте эти данные для тестовых платежей. Не используйте реальную карту в тестовом режиме.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Номер карты</p>
                <button onClick={() => copyToClipboard("4300000000000777")} className="flex items-center gap-1.5 font-mono text-sm hover:text-primary transition-colors">
                  4300 0000 0000 0777
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Срок</p>
                <button onClick={() => copyToClipboard("1225")} className="flex items-center gap-1.5 font-mono text-sm hover:text-primary transition-colors">
                  12/25
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">CVC</p>
                <button onClick={() => copyToClipboard("000")} className="flex items-center gap-1.5 font-mono text-sm hover:text-primary transition-colors">
                  000
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
