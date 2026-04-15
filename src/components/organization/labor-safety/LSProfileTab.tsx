import React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { User, Key, Pencil, Copy, Check, Eye, EyeOff, Plus, Mail, CheckCircle2, Upload, Bell, Shield, FileText, RefreshCw } from "lucide-react";
import type { LaborSafetyProfile } from "@/hooks/useLaborSafetyStudent";

interface ChecklistItem {
  id: string;
  label: string;
  type: string;
  completed: boolean;
}

interface LSProfileTabProps {
  profile: LaborSafetyProfile | null;
  enrollmentsCount: number;
  isEditingCredentials: boolean;
  setIsEditingCredentials: (v: boolean) => void;
  newLogin: string;
  setNewLogin: (v: string) => void;
  newPassword: string;
  setNewPassword: (v: string) => void;
  isUpdatingCredentials: boolean;
  copiedField: string | null;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  isCreatingProfile: boolean;
  isSendingCredentials: boolean;
  isSendingReminder: boolean;
  uploadingType: string | null;
  checklistItems: ChecklistItem[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  createProfileForRecord: () => void;
  sendCredentialsToUser: () => void;
  copyToClipboard: (text: string, field: string) => void;
  handleUpdateCredentials: () => void;
  handleUploadClick: (type: string) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSendDocReminder: () => void;
}

export function LSProfileTab({
  profile, enrollmentsCount, isEditingCredentials, setIsEditingCredentials,
  newLogin, setNewLogin, newPassword, setNewPassword, isUpdatingCredentials,
  copiedField, showPassword, setShowPassword, isCreatingProfile, isSendingCredentials,
  isSendingReminder, uploadingType, checklistItems, fileInputRef,
  createProfileForRecord, sendCredentialsToUser, copyToClipboard,
  handleUpdateCredentials, handleUploadClick, handleFileChange, handleSendDocReminder,
}: LSProfileTabProps) {
  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Mail className="w-4 h-4" />Email</div>
          <div className="font-medium truncate">{profile?.email || "—"}</div>
        </div>
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><User className="w-4 h-4" />Логин</div>
          <div className="font-medium">{profile?.login || "—"}</div>
        </div>
        <div className="p-4 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><RefreshCw className="w-4 h-4" />Курсов</div>
          <div className="font-medium">{enrollmentsCount}</div>
        </div>
      </div>

      {/* Credentials */}
      {!profile ? (
        <div className="bg-card rounded-2xl border border-border p-6 text-center">
          <Key className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
          <p className="text-muted-foreground mb-4">Учётная запись для входа не создана</p>
          <Button onClick={createProfileForRecord} disabled={isCreatingProfile}>
            {isCreatingProfile ? <SigmaSpinner size="sm" className="mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Создать учётную запись
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><Key className="w-5 h-5 text-primary" />Учетные данные для входа</h3>
            {!isEditingCredentials && (
              <Button size="sm" variant="outline" className="rounded-lg gap-2" onClick={() => { setNewLogin(profile.login || ""); setNewPassword(""); setIsEditingCredentials(true); }}>
                <Pencil className="w-4 h-4" />Изменить
              </Button>
            )}
          </div>

          {isEditingCredentials ? (
            <div className="space-y-4">
              <div className="space-y-2"><Label>Новый логин</Label><Input value={newLogin} onChange={e => setNewLogin(e.target.value)} placeholder="Логин" className="rounded-lg" /></div>
              <div className="space-y-2"><Label>Новый пароль</Label><Input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Оставьте пустым, чтобы не менять" className="rounded-lg" /></div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleUpdateCredentials} disabled={isUpdatingCredentials}>{isUpdatingCredentials ? <SigmaSpinner size="sm" /> : <Check className="w-4 h-4" />}Сохранить</Button>
                <Button size="sm" variant="outline" onClick={() => { setIsEditingCredentials(false); setNewLogin(""); setNewPassword(""); }} disabled={isUpdatingCredentials}>Отмена</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Логин</div>
                <div className="flex items-center justify-between">
                  <code className="font-mono text-sm">{profile.login || "—"}</code>
                  {profile.login && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(profile.login || "", "login")}>{copiedField === "login" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}</Button>}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Пароль</div>
                <div className="flex items-center justify-between">
                  <code className="font-mono text-sm">{profile.generated_password ? (showPassword ? profile.generated_password : "••••••••") : "—"}</code>
                  <div className="flex items-center gap-1">
                    {profile.generated_password && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}</Button>}
                    {profile.generated_password && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(profile.generated_password || "", "password")}>{copiedField === "password" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}</Button>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {profile.login && profile.generated_password && (
            <div className="mt-4 pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={sendCredentialsToUser} disabled={isSendingCredentials} className="w-full gap-2">
                {isSendingCredentials ? <SigmaSpinner size="sm" /> : <Mail className="w-4 h-4" />}Отправить данные на email
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />

      {/* Document Checklist */}
      {profile && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-primary" />Чек-лист документов</h3>
            <Button size="sm" variant="outline" className="gap-2" disabled={isSendingReminder} onClick={handleSendDocReminder}>
              {isSendingReminder ? <SigmaSpinner size="sm" /> : <Bell className="w-4 h-4" />}Напомнить о документах
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {checklistItems.map(item => {
              const iconMap: Record<string, React.ComponentType<any>> = { contract: FileText, passport: User, snils: Shield };
              const Icon = iconMap[item.id] || FileText;
              const isUploading = uploadingType === item.type;
              return (
                <div key={item.id} className={`p-4 rounded-xl border transition-colors flex flex-col items-center text-center ${item.completed ? "bg-green-500/10 border-green-500/30" : "bg-muted/50 border-border"}`}>
                  <div className="flex flex-col items-center gap-2">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.completed ? "bg-green-500/20" : "bg-muted"}`}>
                      {item.completed ? <CheckCircle2 className="w-5 h-5 text-green-600" /> : <Icon className="w-5 h-5 text-muted-foreground" />}
                    </div>
                    <span className="text-sm font-medium">{item.label}</span>
                    {!item.completed && (
                      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => handleUploadClick(item.type)} disabled={isUploading}>
                        {isUploading ? <SigmaSpinner size="sm" /> : <><Upload className="w-3 h-3" />Загрузить</>}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
