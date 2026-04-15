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

export function RobokassaSettings({ organizationId }: Props) {
  const [merchantLogin, setMerchantLogin] = useState("");
  const [password1, setPassword1] = useState("");
  const [password2, setPassword2] = useState("");
  const [isTestMode, setIsTestMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showP1, setShowP1] = useState(false);
  const [showP2, setShowP2] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [organizationId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("organization_payment_settings")
        .select("merchant_login, is_test_mode")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (data) {
        setMerchantLogin(data.merchant_login || "");
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
        merchant_login: merchantLogin,
        is_test_mode: isTestMode };
      
      // Only send passwords if they were changed (not empty placeholder)
      if (password1) payload.password1_encrypted = password1;
      if (password2) payload.password2_encrypted = password2;

      if (hasExisting) {
        const { error } = await supabase
          .from("organization_payment_settings")
          .update(payload)
          .eq("organization_id", organizationId);
        if (error) throw error;
      } else {
        if (!password1 || !password2) {
          toast.error("Заполните оба пароля");
          setSaving(false);
          return;
        }
        const { error } = await supabase
          .from("organization_payment_settings")
          .insert(payload);
        if (error) throw error;
        setHasExisting(true);
      }

      setPassword1("");
      setPassword2("");
      toast.success("Настройки Robokassa сохранены");
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
        Настройки Robokassa
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Подключите Robokassa для приёма оплат за курсы. Данные из вашего личного кабинета Robokassa.
      </p>

      <div className="space-y-4 max-w-md">
        <div>
          <Label htmlFor="merchant-login">MerchantLogin</Label>
          <Input
            id="merchant-login"
            value={merchantLogin}
            onChange={e => setMerchantLogin(e.target.value)}
            placeholder="Ваш логин магазина"
          />
        </div>

        <div>
          <Label htmlFor="password1">Пароль #1 (для подписи)</Label>
          <div className="relative">
            <Input
              id="password1"
              type={showP1 ? "text" : "password"}
              value={password1}
              onChange={e => setPassword1(e.target.value)}
              placeholder={hasExisting ? "••••••• (не изменён)" : "Пароль #1"}
            />
            <button type="button" onClick={() => setShowP1(!showP1)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showP1 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <Label htmlFor="password2">Пароль #2 (для проверки)</Label>
          <div className="relative">
            <Input
              id="password2"
              type={showP2 ? "text" : "password"}
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              placeholder={hasExisting ? "••••••• (не изменён)" : "Пароль #2"}
            />
            <button type="button" onClick={() => setShowP2(!showP2)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showP2 ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch checked={isTestMode} onCheckedChange={setIsTestMode} id="test-mode" />
          <Label htmlFor="test-mode" className="cursor-pointer">Тестовый режим</Label>
        </div>

        <Button onClick={handleSave} disabled={saving || !merchantLogin}>
          {saving ? <SigmaSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          Сохранить
        </Button>
      </div>
    </div>
  );
}
