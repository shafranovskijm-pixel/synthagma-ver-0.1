import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  EyeOff,
  XCircle,
  History,
  Download,
  Bell,
  FileSpreadsheet,
  Key,
  Lock,
  Pencil,
  Copy,
  Check,
} from "lucide-react";
import { FRDOExportDialog } from "./FRDOExportDialog";
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

interface ConsentRecord {
  id: string;
  consent_type: string;
  status: string;
  signed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

interface GeneratedConsentRecord {
  id: string;
  consent_type: string;
  full_name: string | null;
  passport_data: string | null;
  address: string | null;
  company_name: string | null;
  company_inn: string | null;
  company_director: string | null;
  company_address: string | null;
  content_html: string;
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
  onStudentUpdated,
}: StudentDetailCardProps) {
  const [activeTab, setActiveTab] = useState("profile");
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [generatedConsents, setGeneratedConsents] = useState<GeneratedConsentRecord[]>([]);
  const [verifications, setVerifications] = useState<VerificationRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [identityDocs, setIdentityDocs] = useState<IdentityDocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; type: string; originalUrl?: string } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isFRDODialogOpen, setIsFRDODialogOpen] = useState(false);
  const [selectedEnrollmentForFRDO, setSelectedEnrollmentForFRDO] = useState<typeof enrollments[0] | null>(null);
  const [viewConsentDialog, setViewConsentDialog] = useState<GeneratedConsentRecord | null>(null);
  
  // Credentials editing state
  const [isEditingCredentials, setIsEditingCredentials] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen && student) {
      loadStudentData();
    }
  }, [isOpen, student]);

  const loadStudentData = async () => {
    if (!student) return;
    setIsLoading(true);

    try {
      const [consentsRes, generatedConsentsRes, verificationsRes, documentsRes, identityDocsRes] = await Promise.all([
        supabase
          .from("student_consents")
          .select("*")
          .eq("user_id", student.user_id)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("consent_documents")
          .select("*")
          .eq("student_user_id", student.user_id)
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
      if (generatedConsentsRes.data) setGeneratedConsents(generatedConsentsRes.data as GeneratedConsentRecord[]);
      if (verificationsRes.data) setVerifications(verificationsRes.data as VerificationRecord[]);
      if (documentsRes.data) setDocuments(documentsRes.data as DocumentRecord[]);
      if (identityDocsRes.data) setIdentityDocs(identityDocsRes.data as IdentityDocumentRecord[]);
    } catch (error) {
      console.error("Error loading student data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
      toast.success("Скопировано в буфер обмена");
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  // Handle credentials update
  const handleUpdateCredentials = async () => {
    if (!student) return;
    
    if (!newLogin && !newPassword) {
      toast.error("Укажите новый логин или пароль");
      return;
    }

    setIsUpdatingCredentials(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-student-credentials', {
        body: {
          user_id: student.user_id,
          new_login: newLogin || undefined,
          new_password: newPassword || undefined,
        }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Учетные данные обновлены");
      setIsEditingCredentials(false);
      setNewLogin("");
      setNewPassword("");
      onStudentUpdated?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ошибка обновления";
      toast.error(message);
    } finally {
      setIsUpdatingCredentials(false);
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

  const handlePreviewDoc = async (doc: IdentityDocumentRecord | DocumentRecord) => {
    if (!doc.file_url) return;
    const ext = doc.file_url.split('.').pop()?.toLowerCase()?.split('?')[0] || '';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
    const isPdf = ext === 'pdf';
    
    setIsLoadingPreview(true);
    
    try {
      if (isImage) {
        // Fetch image as blob to bypass ad blockers
        const response = await fetch(doc.file_url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        setPreviewDoc({
          url: blobUrl,
          name: doc.name,
          type: 'image',
          originalUrl: doc.file_url
        });
      } else if (isPdf) {
        // Use Google Docs Viewer for PDF
        const encodedUrl = encodeURIComponent(doc.file_url);
        setPreviewDoc({
          url: `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`,
          name: doc.name,
          type: 'pdf',
          originalUrl: doc.file_url
        });
      } else {
        // For other files, just download
        handleDownloadDoc(doc.file_url, doc.name);
      }
    } catch (error) {
      console.error("Preview error:", error);
      toast.error("Не удалось открыть предпросмотр");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleDownloadDoc = async (url: string, name: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Download error:", error);
      window.open(url, '_blank');
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

  const getMissingDocuments = () => {
    const requiredDocs = [
      { type: "passport", label: "Паспорт или свидетельство о рождении" },
      { type: "snils", label: "СНИЛС" },
      { type: "education_document", label: "Документ об образовании" },
    ];
    
    return requiredDocs.filter(doc => {
      if (doc.type === "passport") {
        return !identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate");
      }
      if (doc.type === "education_document") {
        return !identityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat");
      }
      return !identityDocs.some(d => d.type === doc.type);
    });
  };

  const [isSendingReminder, setIsSendingReminder] = useState(false);

  const handleSendDocumentsReminder = async () => {
    if (!student) return;
    
    const missingDocs = getMissingDocuments();
    if (missingDocs.length === 0) {
      toast.info("Все обязательные документы уже загружены");
      return;
    }

    setIsSendingReminder(true);
    try {
      // Get organization name
      const { data: orgData } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single();

      const response = await supabase.functions.invoke("send-documents-reminder", {
        body: {
          email: student.email,
          studentName: student.name,
          missingDocuments: missingDocs.map(d => d.label),
          organizationName: orgData?.name || "",
          loginUrl: window.location.origin + "/login",
        },
      });

      if (response.error) throw response.error;

      toast.success("Уведомление отправлено на " + student.email);
    } catch (error) {
      console.error("Error sending reminder:", error);
      toast.error("Ошибка отправки уведомления");
    } finally {
      setIsSendingReminder(false);
    }
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

  // Manual verification toggle - creates/updates verification record
  const handleManualVerification = async (verified: boolean) => {
    if (!student) return;
    
    try {
      if (verified) {
        // Check if there's an existing record to update
        if (latestVerification) {
          const { error } = await supabase
            .from("video_identifications")
            .update({
              status: "verified",
              verified_at: new Date().toISOString(),
            })
            .eq("id", latestVerification.id);
          if (error) throw error;
        } else {
          // Create new manual verification record
          const { error } = await supabase
            .from("video_identifications")
            .insert({
              user_id: student.user_id,
              organization_id: organizationId,
              status: "verified",
              verified_at: new Date().toISOString(),
            });
          if (error) throw error;
        }
        
        toast.success("Видеоидентификация отмечена как пройденная");
      } else {
        // If unchecking - update status to pending or remove record
        if (latestVerification) {
          const { error } = await supabase
            .from("video_identifications")
            .update({
              status: "pending",
              verified_at: null,
            })
            .eq("id", latestVerification.id);
          if (error) throw error;
          toast.success("Статус видеоидентификации сброшен");
        }
      }
      
      loadStudentData();
      onStudentUpdated?.();
    } catch (error) {
      console.error("Error updating manual verification:", error);
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

                    {/* Credentials Management - only for login-based students */}
                    {student.login && (
                      <div className="bg-card rounded-2xl border border-border p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold flex items-center gap-2">
                            <Key className="w-5 h-5 text-primary" />
                            Учетные данные для входа
                          </h3>
                          {!isEditingCredentials && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg gap-2"
                              onClick={() => {
                                setNewLogin(student.login || "");
                                setNewPassword("");
                                setIsEditingCredentials(true);
                              }}
                            >
                              <Pencil className="w-4 h-4" />
                              Изменить
                            </Button>
                          )}
                        </div>

                        {isEditingCredentials ? (
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="newLogin">Новый логин</Label>
                              <Input
                                id="newLogin"
                                value={newLogin}
                                onChange={(e) => setNewLogin(e.target.value)}
                                placeholder="Логин (латинские буквы, цифры, _)"
                                className="rounded-lg"
                              />
                              <p className="text-xs text-muted-foreground">
                                3-30 символов: латинские буквы, цифры, подчёркивание
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="newPassword">Новый пароль</Label>
                              <Input
                                id="newPassword"
                                type="text"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Оставьте пустым, чтобы не менять"
                                className="rounded-lg"
                              />
                              <p className="text-xs text-muted-foreground">
                                Минимум 6 символов. Оставьте пустым, чтобы не менять пароль.
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="rounded-lg gap-2"
                                onClick={handleUpdateCredentials}
                                disabled={isUpdatingCredentials}
                              >
                                {isUpdatingCredentials ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                                Сохранить
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="rounded-lg"
                                onClick={() => {
                                  setIsEditingCredentials(false);
                                  setNewLogin("");
                                  setNewPassword("");
                                }}
                                disabled={isUpdatingCredentials}
                              >
                                Отмена
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="p-3 rounded-lg bg-muted/50">
                              <div className="text-xs text-muted-foreground mb-1">Логин</div>
                              <div className="flex items-center justify-between">
                                <code className="font-mono text-sm">{student.login}</code>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(student.login || "", "login")}
                                >
                                  {copiedField === "login" ? (
                                    <Check className="w-3 h-3 text-green-500" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/50">
                              <div className="text-xs text-muted-foreground mb-1">Пароль</div>
                              <div className="flex items-center justify-between">
                                <code className="font-mono text-sm">
                                  {showPassword ? (student.generated_password || "—") : "••••••••"}
                                </code>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    onClick={() => setShowPassword(!showPassword)}
                                    title={showPassword ? "Скрыть пароль" : "Показать пароль"}
                                  >
                                    {showPassword ? (
                                      <EyeOff className="w-3 h-3" />
                                    ) : (
                                      <Eye className="w-3 h-3" />
                                    )}
                                  </Button>
                                  {student.generated_password && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={() => copyToClipboard(student.generated_password || "", "password")}
                                    >
                                      {copiedField === "password" ? (
                                        <Check className="w-3 h-3 text-green-500" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

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
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-primary" />
                          Чек-лист документов
                        </h3>
                        {getMissingDocuments().length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg gap-2"
                            onClick={handleSendDocumentsReminder}
                            disabled={isSendingReminder}
                          >
                            {isSendingReminder ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Bell className="w-4 h-4" />
                            )}
                            Напомнить о документах
                          </Button>
                        )}
                      </div>
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
                                        <div className="flex flex-wrap gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => handlePreviewDoc(existingDoc)}
                                            title="Предпросмотр"
                                          >
                                            <Eye className="w-3 h-3 mr-1" />
                                            Просмотр
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => existingDoc.file_url && handleDownloadDoc(existingDoc.file_url, existingDoc.name)}
                                            title="Скачать"
                                          >
                                            <Download className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                            onClick={() => handleDeleteIdentityDoc(existingDoc)}
                                            title="Удалить"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        </div>
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

                    {/* Generated Consents */}
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        Сгенерированные согласия ({generatedConsents.length})
                      </h3>
                      {generatedConsents.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>Нет сгенерированных согласий для этого ученика</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {generatedConsents.map((consent) => (
                            <div
                              key={consent.id}
                              className="flex items-center justify-between p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  {consent.consent_type === "individual" ? (
                                    <User className="w-5 h-5 text-primary" />
                                  ) : (
                                    <Building2 className="w-5 h-5 text-primary" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium">
                                    {consent.consent_type === "individual" ? "Для физ. лица" : "Для организации"}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {consent.full_name || consent.company_name || "—"}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatDate(consent.created_at)}
                                  </div>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-lg gap-2"
                                onClick={() => setViewConsentDialog(consent)}
                              >
                                <Eye className="w-4 h-4" />
                                Просмотр
                              </Button>
                            </div>
                          ))}
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

                    {/* Manual Verification Toggle */}
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            latestVerification?.status === "verified" 
                              ? "bg-green-500/10" 
                              : "bg-muted"
                          }`}>
                            {latestVerification?.status === "verified" ? (
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                            ) : (
                              <Video className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <Label htmlFor="manual-verification" className="font-medium cursor-pointer">
                              Видеоидентификация пройдена
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Отметить вручную, что ученик прошёл идентификацию
                            </p>
                          </div>
                        </div>
                        <Checkbox
                          id="manual-verification"
                          checked={latestVerification?.status === "verified"}
                          onCheckedChange={(checked) => handleManualVerification(!!checked)}
                          className="h-5 w-5"
                        />
                      </div>
                    </div>

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
                                <div className="flex items-center gap-2">
                                  {getStatusBadge(e.status)}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="rounded-lg gap-1 h-7 text-xs"
                                    onClick={() => {
                                      setSelectedEnrollmentForFRDO(e);
                                      setIsFRDODialogOpen(true);
                                    }}
                                  >
                                    <FileSpreadsheet className="w-3 h-3" />
                                    ФИС ФРДО
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Прогресс: </span>
                                  <span className="font-medium">{Math.min(e.progress, 100)}%</span>
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
                    {/* Identity Documents */}
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-primary" />
                        Документы личности
                      </h3>
                      {identityDocs.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <p>Нет загруженных документов личности</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {identityDocs.map((d) => (
                            <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                  {d.type === 'passport' || d.type === 'birth_certificate' ? (
                                    <User className="w-5 h-5 text-primary" />
                                  ) : d.type === 'snils' ? (
                                    <Shield className="w-5 h-5 text-primary" />
                                  ) : (
                                    <GraduationCap className="w-5 h-5 text-primary" />
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium">{d.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {formatDate(d.created_at)}
                                  </div>
                                </div>
                              </div>
                              {d.file_url && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handlePreviewDoc(d)}
                                    title="Предпросмотр"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDownloadDoc(d.file_url!, d.name)}
                                    title="Скачать"
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteIdentityDoc(d)}
                                    title="Удалить"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Course Documents */}
                    <div className="bg-card rounded-2xl border border-border p-6">
                      <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary" />
                        Документы курсов
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
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handlePreviewDoc(d)}
                                    title="Предпросмотр"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDownloadDoc(d.file_url!, d.name)}
                                    title="Скачать"
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                </div>
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

      {/* Preview Modal */}
      {previewDoc && (
        <Dialog open={!!previewDoc} onOpenChange={(open) => {
          if (!open && previewDoc?.url.startsWith('blob:')) {
            URL.revokeObjectURL(previewDoc.url);
          }
          setPreviewDoc(null);
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
            <DialogHeader className="p-4 border-b border-border">
              <DialogTitle className="flex items-center justify-between">
                <span className="font-medium truncate pr-4">{previewDoc.name}</span>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => previewDoc.originalUrl && handleDownloadDoc(previewDoc.originalUrl, previewDoc.name)}
                  >
                    <Download className="w-4 h-4" />
                    Скачать
                  </Button>
                  {previewDoc.originalUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => window.open(previewDoc.originalUrl, '_blank')}
                    >
                      <Eye className="w-4 h-4" />
                      Открыть
                    </Button>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center p-4 bg-muted/30 min-h-[60vh] max-h-[75vh] overflow-auto">
              {previewDoc.type === 'image' ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.name}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                  onError={(e) => {
                    // If blob fails, try original URL
                    if (previewDoc.originalUrl && e.currentTarget.src !== previewDoc.originalUrl) {
                      e.currentTarget.src = previewDoc.originalUrl;
                    }
                  }}
                />
              ) : previewDoc.type === 'pdf' ? (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.name}
                  className="w-full h-[70vh] rounded-lg border border-border bg-white"
                  onError={() => {
                    toast.error("Не удалось загрузить PDF. Попробуйте скачать файл.");
                  }}
                />
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* View Generated Consent Dialog */}
      {viewConsentDialog && (
        <Dialog open={!!viewConsentDialog} onOpenChange={(open) => !open && setViewConsentDialog(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {viewConsentDialog.consent_type === "individual" ? (
                    <User className="w-5 h-5 text-primary" />
                  ) : (
                    <Building2 className="w-5 h-5 text-primary" />
                  )}
                  Согласие: {viewConsentDialog.full_name || viewConsentDialog.company_name || "—"}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    const printWindow = window.open("", "_blank");
                    if (printWindow) {
                      printWindow.document.write(`
                        <!DOCTYPE html>
                        <html>
                          <head>
                            <title>Согласие на обработку ПД</title>
                            <style>
                              body { font-family: 'Times New Roman', serif; padding: 40px; max-width: 800px; margin: 0 auto; }
                              @media print { body { padding: 20px; } }
                            </style>
                          </head>
                          <body>${viewConsentDialog.content_html}</body>
                        </html>
                      `);
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }}
                >
                  Печать
                </Button>
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[70vh]">
              <div
                className="p-6 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: viewConsentDialog.content_html }}
              />
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}

      <FRDOExportDialog
        isOpen={isFRDODialogOpen}
        onOpenChange={setIsFRDODialogOpen}
        student={student}
        organizationId={organizationId}
        enrollment={selectedEnrollmentForFRDO}
      />
    </Dialog>
  );
}