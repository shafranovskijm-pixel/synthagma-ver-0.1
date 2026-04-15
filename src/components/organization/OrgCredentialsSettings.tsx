import { useState, useEffect } from "react";
import { KeyRound, Eye, EyeOff, Save, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface OrgCredentialsSettingsProps {
  organizationId: string;
}

export function OrgCredentialsSettings({ organizationId }: OrgCredentialsSettingsProps) {
  const [currentEmail, setCurrentEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchCredentials();
  }, [organizationId]);

  const fetchCredentials = async () => {
    try {
      const { data: rpcData, error } = await supabase
        .rpc('get_decrypted_org_credentials', { p_organization_id: organizationId });
      const data = rpcData?.[0] || null;

      if (error) {
        console.error('Error fetching credentials:', error);
        return;
      }

      if (data) {
        setCurrentEmail(data.login_email);
        setCurrentPassword(data.login_password);
        setNewEmail(data.login_email);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!newEmail.trim()) {
      toast.error("Email не может быть пустым");
      return;
    }

    if (newPassword && newPassword.length < 6) {
      toast.error("Пароль должен быть не менее 6 символов");
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }

    const hasEmailChange = newEmail !== currentEmail;
    const hasPasswordChange = newPassword.length > 0;

    if (!hasEmailChange && !hasPasswordChange) {
      toast.info("Нет изменений для сохранения");
      return;
    }

    setIsSaving(true);
    try {
      const payload: { organization_id: string; new_email?: string; new_password?: string } = {
        organization_id: organizationId
      };

      if (hasEmailChange) {
        payload.new_email = newEmail;
      }
      if (hasPasswordChange) {
        payload.new_password = newPassword;
      }

      const { data, error } = await safeInvoke<any>('update-org-credentials', {
        body: payload
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Учётные данные успешно обновлены");
      
      // Update local state
      if (hasEmailChange) {
        setCurrentEmail(newEmail);
      }
      if (hasPasswordChange) {
        setCurrentPassword(newPassword);
      }
      setNewPassword("");
      setConfirmPassword("");

      // If email changed, user might need to re-login
      if (hasEmailChange) {
        toast.info("Email изменён. Рекомендуется выйти и войти заново.");
      }
    } catch (error) {
      console.error('Error updating credentials:', error);
      toast.error(error instanceof Error ? error.message : "Ошибка обновления данных");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <SigmaSpinner />
      </div>
    );
  }

  if (!currentEmail) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        Учётные данные не настроены. Обратитесь к администратору.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted/50 rounded-lg border border-border">
        <h4 className="font-medium text-sm mb-3">Текущие данные для входа</h4>
        <div className="grid gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Email (логин)</Label>
            <div className="font-mono text-sm bg-background px-3 py-2 rounded border border-border mt-1">
              {currentEmail}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Пароль</Label>
            <div className="flex items-center gap-2 mt-1">
              <div className="font-mono text-sm bg-background px-3 py-2 rounded border border-border flex-1">
                {showCurrentPassword ? currentPassword : "••••••••"}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
           </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 mt-2"
            onClick={() => {
              const text = `Логин: ${currentEmail}\nПароль: ${currentPassword}`;
              navigator.clipboard.writeText(text);
              toast.success("Логин и пароль скопированы");
            }}
          >
            <Copy className="w-3.5 h-3.5" />
            Скопировать всё
          </Button>
        </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm">Изменить данные</h4>
        
        <div>
          <Label htmlFor="new-email" className="text-sm">Новый Email</Label>
          <Input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Введите новый email"
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="new-password" className="text-sm">Новый пароль</Label>
          <div className="relative mt-1">
            <Input
              id="new-password"
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Оставьте пустым, чтобы не менять"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowNewPassword(!showNewPassword)}
            >
              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {newPassword && (
          <div>
            <Label htmlFor="confirm-password" className="text-sm">Подтвердите пароль</Label>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Повторите новый пароль"
              className="mt-1"
            />
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-gradient rounded-xl gap-2 w-full sm:w-auto"
        >
          {isSaving ? (
            <SigmaSpinner size="sm" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Сохранить изменения
        </Button>
      </div>
    </div>
  );
}
