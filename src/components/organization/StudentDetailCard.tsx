import {
  User, FileText, Shield, Video, BookOpen, CheckCircle2, AlertCircle,
  Loader2, Camera, Mail, Building2, GraduationCap, Upload, Trash2,
  Eye, EyeOff, XCircle, History, Download, Bell, FileSpreadsheet,
  Key, Lock, Pencil, Copy, Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FRDOExportDialog } from "./FRDOExportDialog";
import { useStudentDetailCardLogic } from "@/hooks/useStudentDetailCard";

interface StudentDetailCardProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    user_id: string;
    name: string;
    email: string;
    login?: string | null;
    company_name?: string | null;
    generated_password?: string | null;
  } | null;
  organizationId: string;
  onStudentUpdated?: () => void;
  enrollments?: {
    id: string;
    course_id: string;
    course_title: string;
    progress: number;
    status: string;
    started_at: string;
    completed_at?: string | null;
    time_spent: number;
  }[];
}

export function StudentDetailCard({
  isOpen, onOpenChange, student, organizationId, enrollments = [], onStudentUpdated,
}: StudentDetailCardProps) {
  const h = useStudentDetailCardLogic({ isOpen, student, organizationId, enrollments, onStudentUpdated });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified": case "signed": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Подтверждено</Badge>;
      case "rejected": return <Badge variant="destructive">Отклонено</Badge>;
      case "expired": return <Badge variant="secondary">Истекло</Badge>;
      case "pending": return <Badge variant="outline">На проверке</Badge>;
      case "completed": return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Завершён</Badge>;
      case "active": return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Активен</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const checklistItems = [
    { id: "contract", label: "Договор", icon: FileText, completed: h.documents?.some(d => d.type === "contract") || false, uploadable: false },
    { id: "passport", label: "Паспорт / Св-во о рождении", icon: User, completed: h.identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate"), uploadable: true, uploadType: "passport" },
    { id: "snils", label: "СНИЛС", icon: Shield, completed: h.identityDocs.some(d => d.type === "snils"), uploadable: true, uploadType: "snils" },
    { id: "education_doc", label: "Документ об образовании", icon: GraduationCap, completed: h.identityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat"), uploadable: true, uploadType: "education_document" },
    { id: "consent", label: "Согласие на ПД", icon: Shield, completed: h.latestConsent?.status === "signed", uploadable: false },
    { id: "video_id", label: "Видеоидентификация", icon: Video, completed: h.latestVerification?.status === "verified", uploadable: false },
  ];

  if (!student) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="font-display flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="text-xl">{student.name}</div>
              <div className="text-sm font-normal text-muted-foreground">{student.email}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={h.activeTab} onValueChange={h.setActiveTab} className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-12">
            <TabsTrigger value="profile" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><User className="w-4 h-4" />Личное дело</TabsTrigger>
            <TabsTrigger value="identification" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><Video className="w-4 h-4" />Идентификация</TabsTrigger>
            <TabsTrigger value="courses" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><BookOpen className="w-4 h-4" />Курсы</TabsTrigger>
            <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-primary/10 gap-2"><FileText className="w-4 h-4" />Документы</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh]">
            <div className="p-6">
              {h.isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : (
                <>
                  {/* Profile Tab */}
                  <TabsContent value="profile" className="m-0 space-y-6">
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
                        <div className="font-medium">{enrollments.length}</div>
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
                              <Input id="newLogin" value={h.newLogin} onChange={(e) => h.setNewLogin(e.target.value)} placeholder="Логин" className="rounded-lg" />
                              <p className="text-xs text-muted-foreground">3-30 символов: латинские буквы, цифры, подчёркивание</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="newPassword">Новый пароль</Label>
                              <Input id="newPassword" type="text" value={h.newPassword} onChange={(e) => h.setNewPassword(e.target.value)} placeholder="Оставьте пустым, чтобы не менять" className="rounded-lg" />
                              <p className="text-xs text-muted-foreground">Минимум 6 символов.</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="rounded-lg gap-2" onClick={h.handleUpdateCredentials} disabled={h.isUpdatingCredentials}>
                                {h.isUpdatingCredentials ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}Сохранить
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
                            {h.isSendingReminder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}Напомнить о документах
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {checklistItems.map((item) => {
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
                                          {isUploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}Загрузить
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
                          {h.generatedConsents.map((consent) => (
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
                  </TabsContent>

                  {/* Identification Tab */}
                  <TabsContent value="identification" className="m-0 space-y-6">
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2"><Video className="w-5 h-5 text-primary" />Журнал идентификации личности</h3>
                      {h.verifications.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground"><Camera className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Идентификация не пройдена</p></div>
                      ) : (
                        <div className="space-y-4">
                          {h.verifications.map((v) => (
                            <div key={v.id} className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                              {v.photo_url && <img src={v.photo_url} alt="Verification" className="w-20 h-20 rounded-xl object-cover" />}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">{getStatusBadge(v.status)}<span className="text-xs text-muted-foreground">{h.formatDate(v.created_at)}</span></div>
                                {v.verified_at && <p className="text-sm text-muted-foreground">Проверено: {h.formatDate(v.verified_at)}</p>}
                                {v.rejection_reason && <p className="text-sm text-destructive mt-1">Причина: {v.rejection_reason}</p>}
                              </div>
                              {v.status === "pending" && (
                                <div className="flex gap-2">
                                  <Button size="sm" className="rounded-lg gap-1" onClick={() => h.handleVerifyIdentification(v.id, "verify")}><CheckCircle2 className="w-4 h-4" />Подтвердить</Button>
                                  <Button size="sm" variant="destructive" className="rounded-lg gap-1" onClick={() => { const reason = prompt("Причина отклонения:"); if (reason) h.handleVerifyIdentification(v.id, "reject", reason); }}><XCircle className="w-4 h-4" />Отклонить</Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Manual Verification */}
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${h.latestVerification?.status === "verified" ? "bg-green-500/10" : "bg-muted"}`}>
                            {h.latestVerification?.status === "verified" ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Video className="w-5 h-5 text-muted-foreground" />}
                          </div>
                          <div>
                            <Label htmlFor="manual-verification" className="font-medium cursor-pointer">Видеоидентификация пройдена</Label>
                            <p className="text-xs text-muted-foreground">Отметить вручную</p>
                          </div>
                        </div>
                        <Checkbox id="manual-verification" checked={h.latestVerification?.status === "verified"} onCheckedChange={(checked) => h.handleManualVerification(!!checked)} className="h-5 w-5" />
                      </div>
                    </div>

                    {/* Consent History */}
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2"><History className="w-5 h-5 text-primary" />История согласий</h3>
                      {h.consents.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground"><Shield className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Нет подписанных согласий</p></div>
                      ) : (
                        <div className="space-y-3">
                          {h.consents.map((c) => (
                            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                              <div>
                                <div className="flex items-center gap-2 mb-1">{getStatusBadge(c.status)}<span className="text-xs text-muted-foreground">{c.consent_type === "individual" ? "Физ. лицо" : "Юр. лицо"}</span></div>
                                <p className="text-sm text-muted-foreground">{h.formatDate(c.created_at)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* Courses Tab */}
                  <TabsContent value="courses" className="m-0 space-y-4">
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" />Курсы ({enrollments.length})</h3>
                      {enrollments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground"><BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Ученик не зачислен на курсы</p></div>
                      ) : (
                        <div className="space-y-3">
                          {enrollments.map((e) => (
                            <div key={e.id} className="p-4 rounded-xl bg-muted/50">
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="font-medium">{e.course_title}</h4>
                                {getStatusBadge(e.status)}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>Прогресс: {e.progress}%</span>
                                <span>Время: {h.formatDuration(e.time_spent)}</span>
                                {e.completed_at && <span>Завершён: {h.formatDate(e.completed_at)}</span>}
                              </div>
                              <div className="w-full bg-muted rounded-full h-2 mt-2">
                                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${e.progress}%` }} />
                              </div>
                              {e.status === "completed" && (
                                <Button size="sm" variant="outline" className="mt-3 rounded-lg gap-2" onClick={() => { h.setSelectedEnrollmentForFRDO(e); h.setIsFRDODialogOpen(true); }}>
                                  <FileSpreadsheet className="w-4 h-4" />Экспорт ФРДО
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* Documents Tab */}
                  <TabsContent value="documents" className="m-0 space-y-4">
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-primary" />Загруженные документы ({h.identityDocs.length})</h3>
                      {h.identityDocs.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground"><FileText className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>Нет загруженных документов</p></div>
                      ) : (
                        <div className="space-y-3">
                          {h.identityDocs.map((doc) => (
                            <div key={doc.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><FileText className="w-5 h-5 text-primary" /></div>
                                <div>
                                  <div className="font-medium">{doc.name}</div>
                                  <div className="text-xs text-muted-foreground">{h.formatDate(doc.created_at)}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => h.handlePreviewDoc(doc)}>{h.isLoadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}</Button>
                                <Button size="sm" variant="ghost" className="rounded-lg text-destructive hover:text-destructive" onClick={() => h.handleDeleteIdentityDoc(doc)}><Trash2 className="w-4 h-4" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </>
              )}
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>

      {/* Preview Dialog */}
      {h.previewDoc && (
        <Dialog open={!!h.previewDoc} onOpenChange={() => h.setPreviewDoc(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] rounded-2xl">
            <DialogHeader>
              <DialogTitle>{h.previewDoc.name}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto">
              {h.previewDoc.type === 'image' && <img src={h.previewDoc.url} alt={h.previewDoc.name} className="max-w-full rounded-xl" />}
              {h.previewDoc.type === 'pdf' && <iframe src={h.previewDoc.url} className="w-full h-[70vh] rounded-xl" />}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* View Consent Dialog */}
      {h.viewConsentDialog && (
        <Dialog open={!!h.viewConsentDialog} onOpenChange={() => h.setViewConsentDialog(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] rounded-2xl">
            <DialogHeader>
              <DialogTitle>Согласие на обработку ПД</DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[70vh]">
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: h.viewConsentDialog.content_html }} />
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      {/* FRDO Export Dialog */}
      {h.isFRDODialogOpen && h.selectedEnrollmentForFRDO && (
        <FRDOExportDialog
          isOpen={h.isFRDODialogOpen}
          onOpenChange={h.setIsFRDODialogOpen}
          student={{ id: student.id, user_id: student.user_id, name: student.name, email: student.email }}
          enrollment={h.selectedEnrollmentForFRDO}
          organizationId={organizationId}
        />
      )}
    </Dialog>
  );
}
