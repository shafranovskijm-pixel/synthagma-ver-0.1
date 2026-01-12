import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  User,
  FileText,
  Shield,
  Video,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Camera,
  Mail,
  Building2,
  GraduationCap,
  Upload,
  Trash2,
  Eye,
  XCircle,
  History,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

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
  } | null;
  organizationId: string;
  enrollments?: {
    id: string;
    course_title: string;
    progress: number;
    status: string;
    started_at: string;
    completed_at?: string | null;
    time_spent: number;
  }[];
}

interface ConsentRecord {
  id: string;
  consent_type: string;
  status: string;
  signed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface VerificationRecord {
  id: string;
  status: string;
  photo_url: string | null;
  created_at: string;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
}

interface DocumentRecord {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
}

interface IdentityDocumentRecord {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
}

export function StudentDetailCard({
  isOpen,
  onOpenChange,
  student,
  organizationId,
  enrollments = [],
}: StudentDetailCardProps) {
  const [activeTab, setActiveTab] = useState("profile");
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [identityDocs, setIdentityDocs] = useState<IdentityDocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && student) {
      loadStudentData();
    }
  }, [isOpen, student]);

  const loadStudentData = async () => {
    if (!student) return;
    setIsLoading(true);

    try {
      const [consentsRes, verificationsRes, documentsRes, identityDocsRes] = await Promise.all([
        supabase
          .from("student_consents")
          .select("*")
          .eq("user_id", student.user_id)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("video_identifications")
          .select("*")
          .eq("user_id", student.user_id)
          .order("created_at", { ascending: false }),
        supabase
          .from("student_documents")
          .select("*, enrollments!inner(user_id)")
          .eq("enrollments.user_id", student.user_id)
          .order("created_at", { ascending: false }),
        supabase
          .from("student_identity_documents")
          .select("*")
          .eq("user_id", student.user_id)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
      ]);

      if (consentsRes.data) setConsents(consentsRes.data as ConsentRecord[]);
      if (verificationsRes.data) setVerifications(verificationsRes.data as VerificationRecord[]);
      if (documentsRes.data) setDocuments(documentsRes.data as DocumentRecord[]);
      if (identityDocsRes.data) setIdentityDocs(identityDocsRes.data as IdentityDocumentRecord[]);
    } catch (error) {
      console.error("Error loading student data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadClick = (docType: string) => {
    setSelectedDocType(docType);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !student || !selectedDocType) return;

    setUploadingType(selectedDocType);
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${student.user_id}/${selectedDocType}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("student-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("student-documents")
        .getPublicUrl(fileName);

      const docNames: Record<string, string> = {
        passport: "Паспорт",
        birth_certificate: "Свидетельство о рождении",
        snils: "СНИЛС",
        education_document: "Документ об образовании",
      };

      const { error: insertError } = await supabase
        .from("student_identity_documents")
        .insert({
          user_id: student.user_id,
          organization_id: organizationId,
          type: selectedDocType,
          name: docNames[selectedDocType] || file.name,
          file_url: publicUrl,
          file_path: fileName,
        });

      if (insertError) throw insertError;

      toast.success("Документ загружен");
      loadStudentData();
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Ошибка загрузки документа");
    } finally {
      setUploadingType(null);
      setSelectedDocType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteIdentityDoc = async (doc: IdentityDocumentRecord) => {
    try {
      if (doc.file_url) {
        const path = doc.file_url.split("/student-documents/")[1];
        if (path) {
          await supabase.storage.from("student-documents").remove([path]);
        }
      }

      const { error } = await supabase
        .from("student_identity_documents")
        .delete()
        .eq("id", doc.id);

      if (error) throw error;

      toast.success("Документ удалён");
      loadStudentData();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления документа");
    }
  };

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "d MMMM yyyy, HH:mm", { locale: ru });
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours} ч ${minutes} мин`;
    return `${minutes} мин`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
      case "signed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Подтверждено</Badge>;
      case "rejected":
        return <Badge variant="destructive">Отклонено</Badge>;
      case "expired":
        return <Badge variant="secondary">Истекло</Badge>;
      case "pending":
        return <Badge variant="outline">На проверке</Badge>;
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Завершён</Badge>;
      case "active":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Активен</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const latestConsent = consents[0];
  const latestVerification = verifications[0];

  // Document checklist items with upload capability
  const checklistItems = [
    {
      id: "contract",
      label: "Договор",
      icon: FileText,
      completed: documents.some(d => d.type === "contract"),
      uploadable: false,
    },
    {
      id: "passport",
      label: "Паспорт / Св-во о рождении",
      icon: User,
      completed: identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate"),
      uploadable: true,
      uploadType: "passport",
    },
    {
      id: "snils",
      label: "СНИЛС",
      icon: Shield,
      completed: identityDocs.some(d => d.type === "snils"),
      uploadable: true,
      uploadType: "snils",
    },
    {
      id: "education_doc",
      label: "Документ об образовании",
      icon: GraduationCap,
      completed: identityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat"),
      uploadable: true,
      uploadType: "education_document",
    },
    {
      id: "consent",
      label: "Согласие на ПД",
      icon: Shield,
      completed: latestConsent?.status === "signed",
      uploadable: false,
    },
    {
      id: "video_id",
      label: "Видеоидентификация",
      icon: Video,
      completed: latestVerification?.status === "verified",
      uploadable: false,
    },
  ];

  const getIdentityDocByType = (type: string) => {
    return identityDocs.find(d => d.type === type);
  };

  const handleVerifyIdentification = async (id: string, action: "verify" | "reject", reason?: string) => {
    try {
      const updates: Record<string, unknown> = {
        status: action === "verify" ? "verified" : "rejected",
        verified_at: new Date().toISOString(),
      };
      if (action === "reject" && reason) {
        updates.rejection_reason = reason;
      }

      const { error } = await supabase
        .from("video_identifications")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      // Create notification
      await supabase.from("org_notifications").insert({
        organization_id: organizationId,
        user_id: student?.user_id || "",
        type: "video_identification",
        title: action === "verify" ? "Идентификация подтверждена" : "Идентификация отклонена",
        message: action === "verify"
          ? `Идентификация личности ${student?.name} подтверждена`
          : `Идентификация личности ${student?.name} отклонена: ${reason}`,
        related_id: id,
      });

      toast.success(action === "verify" ? "Идентификация подтверждена" : "Идентификация отклонена");
      loadStudentData();
    } catch (error) {
      console.error("Error updating verification:", error);
      toast.error("Ошибка обновления статуса");
    }
  };

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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-12">
            <TabsTrigger value="profile" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
              <User className="w-4 h-4" />
              Личное дело
            </TabsTrigger>
            <TabsTrigger value="identification" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
              <Video className="w-4 h-4" />
              Идентификация
            </TabsTrigger>
            <TabsTrigger value="courses" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
              <BookOpen className="w-4 h-4" />
              Курсы
            </TabsTrigger>
            <TabsTrigger value="documents" className="rounded-lg data-[state=active]:bg-primary/10 gap-2">
              <FileText className="w-4 h-4" />
              Документы
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh]">
            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Profile Tab */}
                  <TabsContent value="profile" className="m-0 space-y-6">
                    {/* Student Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-muted/50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <Mail className="w-4 h-4" />
                          Email
                        </div>
                        <div className="font-medium">{student.email}</div>
                      </div>
                      {student.login && (
                        <div className="p-4 rounded-xl bg-muted/50">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <User className="w-4 h-4" />
                            Логин
                          </div>
                          <div className="font-medium">{student.login}</div>
                        </div>
                      )}
                      {student.company_name && (
                        <div className="p-4 rounded-xl bg-muted/50">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                            <Building2 className="w-4 h-4" />
                            Компания
                          </div>
                          <div className="font-medium">{student.company_name}</div>
                        </div>
                      )}
                      <div className="p-4 rounded-xl bg-muted/50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <GraduationCap className="w-4 h-4" />
                          Курсы
                        </div>
                        <div className="font-medium">{enrollments.length}</div>
                      </div>
                    </div>

                    {/* Hidden file input */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    />

                    {/* Document Checklist */}
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                        Чек-лист документов
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        {checklistItems.map((item) => {
                          const existingDoc = item.uploadType ? getIdentityDocByType(item.uploadType) : null;
                          const isUploading = uploadingType === item.uploadType;
                          
                          return (
                            <div
                              key={item.id}
                              className={`p-4 rounded-xl border transition-colors ${
                                item.completed
                                  ? "bg-green-500/10 border-green-500/30"
                                  : "bg-muted/50 border-border"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center ${
                                  item.completed ? "bg-green-500/20" : "bg-muted"
                                }`}>
                                  {item.completed ? (
                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                  ) : (
                                    <item.icon className="w-5 h-5 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium">{item.label}</div>
                                  {item.uploadable && (
                                    <div className="mt-2 flex gap-1">
                                      {existingDoc ? (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => existingDoc.file_url && window.open(existingDoc.file_url, '_blank')}
                                          >
                                            <Eye className="w-3 h-3 mr-1" />
                                            Открыть
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                            onClick={() => handleDeleteIdentityDoc(existingDoc)}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        </>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => item.uploadType && handleUploadClick(item.uploadType)}
                                          disabled={isUploading}
                                        >
                                          {isUploading ? (
                                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                          ) : (
                                            <Upload className="w-3 h-3 mr-1" />
                                          )}
                                          Загрузить
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
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Согласие на обработку ПД
                      </h3>
                      {latestConsent ? (
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusBadge(latestConsent.status)}
                            </div>
                            {latestConsent.signed_at && (
                              <p className="text-sm text-muted-foreground">
                                Подписано: {formatDate(latestConsent.signed_at)}
                              </p>
                            )}
                            {latestConsent.expires_at && (
                              <p className="text-sm text-muted-foreground">
                                Действует до: {formatDate(latestConsent.expires_at)}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <AlertCircle className="w-5 h-5" />
                          <span>Согласие не подписано</span>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  {/* Identification Tab */}
                  <TabsContent value="identification" className="m-0 space-y-6">
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Video className="w-5 h-5 text-primary" />
                        Журнал идентификации личности
                      </h3>
                      
                      {verifications.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Camera className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>Идентификация не пройдена</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {verifications.map((v) => (
                            <div key={v.id} className="flex items-start gap-4 p-4 rounded-xl bg-muted/50">
                              {v.photo_url && (
                                <img
                                  src={v.photo_url}
                                  alt="Verification"
                                  className="w-20 h-20 rounded-xl object-cover"
                                />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  {getStatusBadge(v.status)}
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(v.created_at)}
                                  </span>
                                </div>
                                {v.verified_at && (
                                  <p className="text-sm text-muted-foreground">
                                    Проверено: {formatDate(v.verified_at)}
                                  </p>
                                )}
                                {v.rejection_reason && (
                                  <p className="text-sm text-destructive mt-1">
                                    Причина отклонения: {v.rejection_reason}
                                  </p>
                                )}
                              </div>
                              {v.status === "pending" && (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="rounded-lg gap-1"
                                    onClick={() => handleVerifyIdentification(v.id, "verify")}
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Подтвердить
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="rounded-lg gap-1"
                                    onClick={() => {
                                      const reason = prompt("Укажите причину отклонения:");
                                      if (reason) handleVerifyIdentification(v.id, "reject", reason);
                                    }}
                                  >
                                    <XCircle className="w-4 h-4" />
                                    Отклонить
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Consent History */}
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <History className="w-5 h-5 text-primary" />
                        История согласий
                      </h3>
                      {consents.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>Нет подписанных согласий</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {consents.map((c) => (
                            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  {getStatusBadge(c.status)}
                                  <span className="text-xs text-muted-foreground">
                                    {c.consent_type === "individual" ? "Физ. лицо" : "Юр. лицо"}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {formatDate(c.created_at)}
                                </p>
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
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-primary" />
                        Журнал занятий
                      </h3>
                      {enrollments.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>Нет назначенных курсов</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {enrollments.map((e) => (
                            <div key={e.id} className="p-4 rounded-xl bg-muted/50">
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-medium">{e.course_title}</div>
                                {getStatusBadge(e.status)}
                              </div>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Прогресс: </span>
                                  <span className="font-medium">{e.progress}%</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Время: </span>
                                  <span className="font-medium">{formatDuration(e.time_spent)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Начало: </span>
                                  <span className="font-medium">
                                    {format(new Date(e.started_at), "dd.MM.yyyy", { locale: ru })}
                                  </span>
                                </div>
                              </div>
                              {e.completed_at && (
                                <div className="mt-2 text-sm text-green-600">
                                  <CheckCircle2 className="w-4 h-4 inline mr-1" />
                                  Завершён: {format(new Date(e.completed_at), "dd.MM.yyyy", { locale: ru })}
                                </div>
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
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        Документы слушателя
                      </h3>
                      {documents.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>Нет загруженных документов</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {documents.map((d) => (
                            <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                  <FileText className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                  <div className="font-medium">{d.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {d.type} • {formatDate(d.created_at)}
                                  </div>
                                </div>
                              </div>
                              {d.file_url && (
                                <Button variant="ghost" size="icon" asChild>
                                  <a href={d.file_url} target="_blank" rel="noopener noreferrer">
                                    <Download className="w-4 h-4" />
                                  </a>
                                </Button>
                              )}
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
    </Dialog>
  );
}