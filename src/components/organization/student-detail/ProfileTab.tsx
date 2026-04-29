import {
  User, Mail, Building2, GraduationCap, Key, Pencil, Check, Copy,
  Eye, EyeOff, CheckCircle2, Upload, Trash2, Download,
  Bell, FileText, Shield, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getStatusBadge } from "./StatusBadge";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";

interface ProfileTabProps {
  student: {
    name: string;
    email: string;
    login?: string | null;
    company_name?: string | null;
    generated_password?: string | null;
  };
  enrollmentsCount: number;
  h: any;
  orgPlan?: string;
}

export function ProfileTab({ student, enrollmentsCount, h, orgPlan }: ProfileTabProps) {
  const checklistItems = [
    { id: "contract", label: "Договор", icon: FileText, completed: h.documents?.some((d: any) => d.type === "contract") || false, uploadable: false },
    { id: "passport", label: "Паспорт / Св-во о рождении", icon: User, completed: h.identityDocs.some((d: any) => d.type === "passport" || d.type === "birth_certificate"), uploadable: true, uploadType: "passport" },
    { id: "snils", label: "СНИЛС", icon: Shield, completed: h.identityDocs.some((d: any) => d.type === "snils"), uploadable: true, uploadType: "snils" },
    { id: "education_doc", label: "Документ об образовании", icon: GraduationCap, completed: h.identityDocs.some((d: any) => d.type === "education_document" || d.type === "diploma" || d.type === "attestat"), uploadable: true, uploadType: "education_document" },
    { id: "consent", label: "Согласие на ПД", icon: Shield, completed: h.latestConsent?.status === "signed", uploadable: false },
    { id: "video_id", label: "Видеоидентификация", icon: import("lucide-react").then(m => m.Video), completed: h.latestVerification?.status === "verified", uploadable: false },
  ];

  // Simplified checklist without dynamic import issue
  const checklistItemsFixed = [
    { id: "contract", label: "Договор", icon: FileText, completed: h.documents?.some((d: any) => d.type === "contract") || false, uploadable: false, uploadType: undefined },
    { id: "passport", label: "Паспорт / Св-во о рождении", icon: User, completed: h.identityDocs.some((d: any) => d.type === "passport" || d.type === "birth_certificate"), uploadable: true, uploadType: "passport" },
    { id: "snils", label: "СНИЛС", icon: Shield, completed: h.identityDocs.some((d: any) => d.type === "snils"), uploadable: true, uploadType: "snils" },
    { id: "education_doc", label: "Документ об образовании", icon: GraduationCap, completed: h.identityDocs.some((d: any) => d.type === "education_document" || d.type === "diploma" || d.type === "attestat"), uploadable: true, uploadType: "education_document" },
    { id: "pep", label: "Соглашение об использовании ПЭП", icon: Shield, completed: !!h.latestPepAgreement, uploadable: false, uploadType: undefined },
    { id: "consent", label: "Согласие на ПД (подписано ПЭП)", icon: Shield, completed: h.latestConsent?.status === "signed", uploadable: false, uploadType: undefined },
    { id: "video_id", label: "Видеоидентификация", icon: CheckCircle2, completed: h.latestVerification?.status === "verified", uploadable: false, uploadType: undefined },
  ];

  return (
    <div className="space-y-6">
      {/* Personal Data — editable full name */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2"><User className="w-5 h-5 text-primary" />Личные данные</h3>
          {!h.isEditingName && (
            <Button size="sm" variant="outline" className="rounded-lg gap-2" onClick={() => { h.setNewFullName(student.name || ""); h.setIsEditingName(true); }}>
              <Pencil className="w-4 h-4" />Изменить
            </Button>
          )}
        </div>
        {h.isEditingName ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="newFullName">ФИО</Label>
              <Input
                id="newFullName"
                value={h.newFullName}
                onChange={(e: any) => h.setNewFullName(e.target.value)}
                placeholder="Иванов Иван Иванович"
                maxLength={100}
                className="rounded-lg"
              />
              <p className="text-xs text-muted-foreground">До 100 символов. Имя обновится в карточке и в списке учеников.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="rounded-lg gap-2" onClick={h.handleUpdateFullName} disabled={h.isUpdatingName}>
                {h.isUpdatingName ? <SigmaSpinner size="sm" /> : <Check className="w-4 h-4" />}Сохранить
              </Button>
              <Button size="sm" variant="outline" className="rounded-lg" onClick={() => { h.setIsEditingName(false); h.setNewFullName(""); }} disabled={h.isUpdatingName}>Отмена</Button>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">ФИО</div>
            <div className="font-medium">{student.name || "—"}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Mail className="w-4 h-4" />Email</div>
          <div className="font-medium">{student.email}</div>
        </div>
        {student.login && (
          <div className="p-4 rounded-xl bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><User className="w-4 h-4" />Логин</div>
            <div className="font-medium">{student.login}</div>
          </div>
        )}
        {student.company_name && (
          <div className="p-4 rounded-xl bg-muted/50">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><Building2 className="w-4 h-4" />Компания</div>
            <div className="font-medium">{student.company_name}</div>
          </div>
        )}
        <div className="p-4 rounded-xl bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1"><GraduationCap className="w-4 h-4" />Курсы</div>
          <div className="font-medium">{enrollmentsCount}</div>
        </div>
      </div>

      {/* Credentials */}
      {student.login && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2"><Key className="w-5 h-5 text-primary" />Учетные данные для входа</h3>
            {!h.isEditingCredentials && (
              <Button size="sm" variant="outline" className="rounded-lg gap-2" onClick={() => { h.setNewLogin(student.login || ""); h.setNewPassword(""); h.setIsEditingCredentials(true); }}>
                <Pencil className="w-4 h-4" />Изменить
              </Button>
            )}
          </div>
          {h.isEditingCredentials ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newLogin">Новый логин</Label>
                <Input id="newLogin" value={h.newLogin} onChange={(e: any) => h.setNewLogin(e.target.value)} placeholder="Логин" className="rounded-lg" />
                <p className="text-xs text-muted-foreground">3-30 символов: латинские буквы, цифры, подчёркивание</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Новый пароль</Label>
                <Input id="newPassword" type="text" value={h.newPassword} onChange={(e: any) => h.setNewPassword(e.target.value)} placeholder="Оставьте пустым, чтобы не менять" className="rounded-lg" />
                <p className="text-xs text-muted-foreground">Минимум 6 символов.</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-lg gap-2" onClick={h.handleUpdateCredentials} disabled={h.isUpdatingCredentials}>
                  {h.isUpdatingCredentials ? <SigmaSpinner size="sm" /> : <Check className="w-4 h-4" />}Сохранить
                </Button>
                <Button size="sm" variant="outline" className="rounded-lg" onClick={() => { h.setIsEditingCredentials(false); h.setNewLogin(""); h.setNewPassword(""); }} disabled={h.isUpdatingCredentials}>Отмена</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Логин</div>
                <div className="flex items-center justify-between">
                  <code className="font-mono text-sm">{student.login}</code>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => h.copyToClipboard(student.login || "", "login")}>
                    {h.copiedField === "login" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Пароль</div>
                <div className="flex items-center justify-between">
                  <code className="font-mono text-sm">{h.showPassword ? (student.generated_password || "—") : "••••••••"}</code>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => h.setShowPassword(!h.showPassword)}>
                      {h.showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    {student.generated_password && (
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => h.copyToClipboard(student.generated_password || "", "password")}>
                        {h.copiedField === "password" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <input type="file" ref={h.fileInputRef} onChange={h.handleFileChange} className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />

      {/* Document Checklist */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-primary" />Чек-лист документов</h3>
          {h.getMissingDocuments().length > 0 && (
            <Button size="sm" variant="outline" className="rounded-lg gap-2" onClick={h.handleSendDocumentsReminder} disabled={h.isSendingReminder}>
              {h.isSendingReminder ? <SigmaSpinner size="sm" /> : <Bell className="w-4 h-4" />}Напомнить о документах
            </Button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {checklistItemsFixed.map((item) => {
            const existingDoc = item.uploadType ? h.getIdentityDocByType(item.uploadType) : null;
            const isUploading = h.uploadingType === item.uploadType;
            return (
              <div key={item.id} className={`p-4 rounded-xl border transition-colors ${item.completed ? "bg-green-500/10 border-green-500/30" : "bg-muted/50 border-border"}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${item.completed ? "bg-green-500/20" : "bg-muted"}`}>
                    {item.completed ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <item.icon className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.label}</div>
                    {item.uploadable && (
                      <div className="mt-2 flex gap-1">
                        {existingDoc ? (
                          <div className="flex flex-wrap gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => h.handlePreviewDoc(existingDoc)}><Eye className="w-3 h-3 mr-1" />Просмотр</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => existingDoc.file_url && h.handleDownloadDoc(existingDoc.file_url, existingDoc.name)}><Download className="w-3 h-3" /></Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => h.handleDeleteIdentityDoc(existingDoc)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => item.uploadType && h.handleUploadClick(item.uploadType)} disabled={isUploading}>
                            {isUploading ? <SigmaSpinner size="xs" className="mr-1" /> : <Upload className="w-3 h-3 mr-1" />}Загрузить
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Consent Status */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-primary" />Согласие на обработку ПД</h3>
        {h.latestConsent ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">{getStatusBadge(h.latestConsent.status)}</div>
              {h.latestConsent.signed_at && <p className="text-sm text-muted-foreground">Подписано: {h.formatDate(h.latestConsent.signed_at)}</p>}
              {h.latestConsent.expires_at && <p className="text-sm text-muted-foreground">Действует до: {h.formatDate(h.latestConsent.expires_at)}</p>}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-muted-foreground"><AlertCircle className="w-5 h-5" /><span>Согласие не подписано</span></div>
        )}
      </div>

      {/* Generated Consents */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />Сгенерированные согласия ({h.generatedConsents.length})</h3>
        {h.generatedConsents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Нет сгенерированных согласий</p></div>
        ) : (
          <div className="space-y-3">
            {h.generatedConsents.map((consent: any) => (
              <div key={consent.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    {consent.consent_type === "individual" ? <User className="w-5 h-5 text-primary" /> : <Building2 className="w-5 h-5 text-primary" />}
                  </div>
                  <div>
                    <div className="font-medium">{consent.consent_type === "individual" ? "Для физ. лица" : "Для организации"}</div>
                    <div className="text-sm text-muted-foreground">{consent.full_name || consent.company_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{h.formatDate(consent.created_at)}</div>
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="rounded-lg gap-2" onClick={() => h.setViewConsentDialog(consent)}><Eye className="w-4 h-4" />Просмотр</Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
