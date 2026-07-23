import { useState, useEffect } from "react";
import {
  User, Mail, Building2, GraduationCap, Key, Pencil, Check, Copy,
  Eye, EyeOff, CheckCircle2, Upload, Trash2, Download,
  Bell, FileText, Shield, AlertCircle, Link2, Send, XCircle, Phone, Calendar, Globe, Ban, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CitizenshipCombobox } from "@/components/organization/CitizenshipCombobox";
import { getStatusBadge } from "./StatusBadge";
import { toast } from "sonner";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";


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

      {/* Персональные данные для ФИС ФРДО */}
      <PersonalFrdoSection h={h} />



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
                  {(() => {
                    const rawPw = student.generated_password || "";
                    const looksEncrypted = rawPw.startsWith("ENC:");
                    const plainPw = h.decryptedPassword || (looksEncrypted ? "" : rawPw);
                    const display = h.isLoadingPassword
                      ? "Загрузка…"
                      : plainPw
                        ? (h.showPassword ? plainPw : "••••••••")
                        : "—";
                    return <code className="font-mono text-sm break-all">{display}</code>;
                  })()}
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => h.setShowPassword(!h.showPassword)} disabled={!h.decryptedPassword && (student.generated_password || "").startsWith("ENC:")}>
                      {h.showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    {(h.decryptedPassword || (student.generated_password && !student.generated_password.startsWith("ENC:"))) && (
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => h.copyToClipboard(h.decryptedPassword || student.generated_password || "", "password")}>
                        {h.copiedField === "password" ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                      </Button>
                    )}
                  </div>
                </div>
                {!h.isLoadingPassword && !h.decryptedPassword && (student.generated_password || "").startsWith("ENC:") && (
                  <p className="text-xs text-muted-foreground mt-2">Пароль зашифрован. Нажмите «Изменить», чтобы задать новый и отправить ученику.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Login links */}
      {student.login && (
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold flex items-center gap-2"><Link2 className="w-5 h-5 text-primary" />Ссылки для входа ученика</h3>
            {h.autoLoginToken && (
              <Button size="sm" variant="ghost" className="rounded-lg gap-2 text-destructive hover:text-destructive" onClick={h.revokeAutoLoginToken} disabled={h.isLoginLinkBusy}>
                <XCircle className="w-4 h-4" />Отозвать
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Ссылка автовхода — бессрочная, работает до отзыва. Передавайте только лично ученику.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-lg gap-2" onClick={h.copyAutoLoginLink} disabled={h.isLoginLinkBusy}>
              <Link2 className="w-4 h-4" />Скопировать ссылку автовхода
            </Button>
            <Button size="sm" variant="outline" className="rounded-lg gap-2" onClick={h.copyCredentialsLink} disabled={h.isLoginLinkBusy}>
              <Copy className="w-4 h-4" />Скопировать ссылку с логином/паролем
            </Button>
            <Button size="sm" className="rounded-lg gap-2" onClick={h.sendLoginLinkEmail} disabled={h.isLoginLinkBusy}>
              <Send className="w-4 h-4" />Отправить на email
            </Button>
          </div>
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

// ─── Персональные данные для ФИС ФРДО ───
function PersonalFrdoSection({ h }: { h: any }) {
  const [phone, setPhone] = useState<string>(h.phone || "");
  const [birthDate, setBirthDate] = useState<string>(h.frdoData?.birth_date || "");
  const [snils, setSnils] = useState<string>(h.frdoData?.snils || "");

  useEffect(() => { setPhone(h.phone || ""); }, [h.phone]);
  useEffect(() => { setBirthDate(h.frdoData?.birth_date || ""); }, [h.frdoData?.birth_date]);
  useEffect(() => { setSnils(h.frdoData?.snils || ""); }, [h.frdoData?.snils]);

  const gender = h.frdoData?.gender || "";
  const citizenship = h.frdoData?.citizenship_code || "643";

  const formatSnils = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 9)} ${d.slice(9)}`;
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Персональные данные</h3>
        <span className="text-xs text-muted-foreground">— используются для ФИС ФРДО и документов</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Phone className="w-4 h-4" />Телефон</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => { if (phone !== (h.phone || "")) h.savePhone(phone); }}
            placeholder="+7 (___) ___-__-__"
            className="rounded-lg"
            disabled={h.savingPhone}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2"><User className="w-4 h-4" />Пол</Label>
          <Select
            value={gender}
            onValueChange={(v) => h.saveFrdoField("gender", v)}
            disabled={h.savingFrdoField === "gender"}
          >
            <SelectTrigger className="rounded-lg"><SelectValue placeholder="Не указан" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Мужской">Мужской</SelectItem>
              <SelectItem value="Женский">Женский</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Calendar className="w-4 h-4" />Дата рождения</Label>
          <Input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            onBlur={() => { if (birthDate !== (h.frdoData?.birth_date || "")) h.saveFrdoField("birth_date", birthDate); }}
            className="rounded-lg"
            disabled={h.savingFrdoField === "birth_date"}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Shield className="w-4 h-4" />СНИЛС</Label>
          <Input
            value={snils}
            onChange={(e) => setSnils(formatSnils(e.target.value))}
            onBlur={() => { if (snils !== (h.frdoData?.snils || "")) h.saveFrdoField("snils", snils); }}
            placeholder="123-456-789 00"
            className="rounded-lg font-mono"
            disabled={h.savingFrdoField === "snils"}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label className="flex items-center gap-2"><Globe className="w-4 h-4" />Гражданство</Label>
          <CitizenshipCombobox
            value={citizenship}
            onChange={(code) => h.saveFrdoField("citizenship_code", code)}
          />
          <p className="text-xs text-muted-foreground">Классификатор ОКСМ. По умолчанию — Россия (643).</p>
        </div>
      </div>

      <PassportFieldsBlock h={h} />
    </div>
  );
}

// ─── Паспортные данные ───
function PassportFieldsBlock({ h }: { h: any }) {
  const [series, setSeries] = useState<string>(h.frdoData?.passport_series || "");
  const [number, setNumber] = useState<string>(h.frdoData?.passport_number || "");
  const [issueDate, setIssueDate] = useState<string>(h.frdoData?.passport_issue_date || "");
  const [issuedBy, setIssuedBy] = useState<string>(h.frdoData?.passport_issued_by || "");
  const [deptCode, setDeptCode] = useState<string>(h.frdoData?.passport_department_code || "");

  useEffect(() => { setSeries(h.frdoData?.passport_series || ""); }, [h.frdoData?.passport_series]);
  useEffect(() => { setNumber(h.frdoData?.passport_number || ""); }, [h.frdoData?.passport_number]);
  useEffect(() => { setIssueDate(h.frdoData?.passport_issue_date || ""); }, [h.frdoData?.passport_issue_date]);
  useEffect(() => { setIssuedBy(h.frdoData?.passport_issued_by || ""); }, [h.frdoData?.passport_issued_by]);
  useEffect(() => { setDeptCode(h.frdoData?.passport_department_code || ""); }, [h.frdoData?.passport_department_code]);

  const formatSeries = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    return d.length <= 2 ? d : `${d.slice(0, 2)} ${d.slice(2)}`;
  };
  const formatDept = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 6);
    return d.length <= 3 ? d : `${d.slice(0, 3)}-${d.slice(3)}`;
  };

  const saveIfChanged = (field: string, value: string, current: string) => {
    if (value !== (current || "")) h.saveFrdoField(field, value);
  };

  return (
    <div className="border-t border-border pt-4 mt-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        <h4 className="font-medium text-sm">Паспортные данные (РФ)</h4>
        <span className="text-xs text-muted-foreground">— автозаполнение по скану на тарифах «Профессиональный» / «Максимальный»</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Серия</Label>
          <Input
            value={series}
            onChange={(e) => setSeries(formatSeries(e.target.value))}
            onBlur={() => saveIfChanged("passport_series", series, h.frdoData?.passport_series || "")}
            placeholder="XX XX"
            className="rounded-lg font-mono"
            disabled={h.savingFrdoField === "passport_series"}
          />
        </div>
        <div className="space-y-2">
          <Label>Номер</Label>
          <Input
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onBlur={() => saveIfChanged("passport_number", number, h.frdoData?.passport_number || "")}
            placeholder="XXXXXX"
            className="rounded-lg font-mono"
            disabled={h.savingFrdoField === "passport_number"}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex items-center gap-2"><Calendar className="w-4 h-4" />Дата выдачи</Label>
          <Input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            onBlur={() => saveIfChanged("passport_issue_date", issueDate, h.frdoData?.passport_issue_date || "")}
            className="rounded-lg"
            disabled={h.savingFrdoField === "passport_issue_date"}
          />
        </div>
        <div className="space-y-2">
          <Label>Код подразделения</Label>
          <Input
            value={deptCode}
            onChange={(e) => setDeptCode(formatDept(e.target.value))}
            onBlur={() => saveIfChanged("passport_department_code", deptCode, h.frdoData?.passport_department_code || "")}
            placeholder="XXX-XXX"
            className="rounded-lg font-mono"
            disabled={h.savingFrdoField === "passport_department_code"}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Кем выдан</Label>
          <Input
            value={issuedBy}
            onChange={(e) => setIssuedBy(e.target.value)}
            onBlur={() => saveIfChanged("passport_issued_by", issuedBy, h.frdoData?.passport_issued_by || "")}
            placeholder="Наименование органа, выдавшего паспорт"
            className="rounded-lg"
            disabled={h.savingFrdoField === "passport_issued_by"}
          />
        </div>
      </div>
    </div>
  );
}

