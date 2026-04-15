import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, KeyRound, Save } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface OrgSettingsPanelProps {
  organizationId: string;
  organizationEmail: string;
  settings: {
    name: string; email: string; phone: string; inn: string; contact_name: string;
    ai_enabled: boolean; ai_provider: string; frdo_enabled: boolean;
    storage_limit_bytes: number; notify_on_limit_80: boolean; notify_on_limit_exceeded: boolean;
  };
  setSettings: (s: any) => void;
  isSaving: boolean;
  saveSettings: () => Promise<void>;
  credentials: { login_email: string; login_password: string } | null;
  setCredentials: (c: any) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  generatingCredentials: boolean;
  setGeneratingCredentials: (v: boolean) => void;
  resettingPassword: boolean;
  setResettingPassword: (v: boolean) => void;
}

const cardClass = "shadow-sm hover:shadow-md transition-shadow duration-200";

export function OrgSettingsPanel({
  organizationId, organizationEmail, settings, setSettings, isSaving, saveSettings,
  credentials, setCredentials, showPassword, setShowPassword,
  generatingCredentials, setGeneratingCredentials, resettingPassword, setResettingPassword }: OrgSettingsPanelProps) {
  return (
    <div className="space-y-6">
      <Card className={`${cardClass} border-primary/20`}>
        <CardHeader className="pb-3">
          <CardDescription className="flex items-center gap-1.5">
            <div className="p-1 rounded-md bg-primary/10"><KeyRound className="w-3 h-3 text-primary" /></div>
            Учётные данные организации
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {credentials ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Логин:</span>
                  <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{credentials.login_email}</code>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(credentials.login_email); toast.success("Логин скопирован"); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Пароль:</span>
                  <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{showPassword ? credentials.login_password : "••••••••"}</code>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(credentials.login_password); toast.success("Пароль скопирован"); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  navigator.clipboard.writeText(`Логин: ${credentials.login_email}\nПароль: ${credentials.login_password}`);
                  toast.success("Логин и пароль скопированы");
                }}><Copy className="w-3.5 h-3.5" />Скопировать всё</Button>
              </div>
              <Button variant="outline" size="sm" disabled={resettingPassword} onClick={async () => {
                setResettingPassword(true);
                try {
                  const { error } = await supabase.functions.invoke("reset-org-password", { body: { organization_id: organizationId } });
                  if (error) throw error;
                  toast.success("Пароль сброшен");
                  const { data: newCreds } = await supabase.rpc('get_decrypted_org_credentials', { p_organization_id: organizationId });
                  if (newCreds && newCreds.length > 0) setCredentials(newCreds[0]);
                } catch (err: any) { console.error("Reset password error:", err); toast.error("Ошибка сброса пароля"); }
                finally { setResettingPassword(false); }
              }}>
                {resettingPassword ? <SigmaSpinner size="xs" className=".5 .5 mr-1.5" /> : <KeyRound className="w-3.5 h-3.5 mr-1.5" />}
                Сбросить пароль
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Логин:</span>
                <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{organizationEmail || "—"}</code>
                {organizationEmail && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { navigator.clipboard.writeText(organizationEmail); toast.success("Email скопирован"); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground italic">Пароль не сохранён в системе</span>
              </div>
              <Button variant="default" size="sm" disabled={generatingCredentials} onClick={async () => {
                setGeneratingCredentials(true);
                try {
                  const { data, error } = await supabase.functions.invoke("generate-org-credentials", { body: { organization_id: organizationId } });
                  if (error) throw error;
                  toast.success(`Учётные данные созданы: ${data.login_email}`);
                  const { data: newCreds } = await supabase.rpc('get_decrypted_org_credentials', { p_organization_id: organizationId });
                  if (newCreds && newCreds.length > 0) setCredentials(newCreds[0]);
                } catch (err: any) { console.error("Generate credentials error:", err); toast.error("Ошибка генерации учётных данных"); }
                finally { setGeneratingCredentials(false); }
              }}>
                {generatingCredentials ? <SigmaSpinner size="xs" className=".5 .5 mr-1.5" /> : <KeyRound className="w-3.5 h-3.5 mr-1.5" />}
                Сгенерировать учётные данные
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={cardClass}>
        <CardHeader>
          <CardTitle>Настройки организации</CardTitle>
          <CardDescription>Управление параметрами организации</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Название организации</Label>
              <Input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={settings.email} onChange={(e) => setSettings({ ...settings, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Телефон</Label>
              <Input value={settings.phone} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>ИНН</Label>
              <Input value={settings.inn} onChange={(e) => setSettings({ ...settings, inn: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Контактное лицо</Label>
              <Input value={settings.contact_name} onChange={(e) => setSettings({ ...settings, contact_name: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={saveSettings} disabled={isSaving} className="w-full md:w-auto" size="lg">
        {isSaving ? <SigmaSpinner size="sm" className="mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        Сохранить все настройки
      </Button>
    </div>
  );
}
