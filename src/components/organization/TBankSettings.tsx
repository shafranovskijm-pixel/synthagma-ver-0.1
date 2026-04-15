import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CreditCard, Save, Eye, EyeOff } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface Props {
  organizationId: string;
}

export function TBankSettings({ organizationId }: Props) {
  const [terminalKey, setTerminalKey] = useState("");
  const [password, setPassword] = useState("");
  const [isTestMode, setIsTestMode] = useState(true);
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
        .select("terminal_key, is_test_mode")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (data) {
        setTerminalKey(data.terminal_key || "");
        setIsTestMode(data.is_test_mode);
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

  if (loading) {
    return <div className="flex items-center gap-2 text-muted-foreground"><SigmaSpinner size="sm" />Загрузка...</div>;
  }

  return (
    <div className="bg-card rounded-xl lg:rounded-2xl border border-border p-4 lg:p-6">
      <h3 className="font-display font-semibold text-base lg:text-lg flex items-center gap-2 mb-4">
        <CreditCard className="w-4 h-4 lg:w-5 lg:h-5" />
        Настройки Т-Банк Эквайринг
      </h3>
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

        <Button onClick={handleSave} disabled={saving || !terminalKey}>
          {saving ? <SigmaSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Сохранить
        </Button>
      </div>
    </div>
  );
}
