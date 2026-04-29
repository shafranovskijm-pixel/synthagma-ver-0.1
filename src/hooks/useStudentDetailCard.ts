import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { getSignedStorageUrl, extractStoragePath } from "@/utils/storageHelpers";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Student } from "@/types/shared";

// ─── Original dashboard-level hook (manages open/close of StudentDetailCard dialog) ───
interface StudentCardData {
  id: string;
  user_id: string;
  name: string;
  email: string;
  login?: string | null;
  company_name?: string | null;
  generated_password?: string | null;
  last_visit_at?: string | null;
}

interface StudentCardEnrollment {
  id: string;
  course_id: string;
  course_title: string;
  progress: number;
  status: string;
  started_at: string;
  completed_at?: string | null;
  time_spent: number;
  access_days?: number | null;
  expires_at?: string | null;
}

export function useStudentDetailCard() {
  const [showStudentDetailCard, setShowStudentDetailCard] = useState(false);
  const [studentDetailCardData, setStudentDetailCardData] = useState<StudentCardData | null>(null);
  const [studentDetailCardEnrollments, setStudentDetailCardEnrollments] = useState<StudentCardEnrollment[]>([]);

  // viewStudent is now handled at the dashboard level via tabNavigation
  const viewStudent = useCallback(async (_student: Student) => {
    // no-op: overridden in useOrganizationDashboard
  }, []);

  return {
    showStudentDetailCard,
    setShowStudentDetailCard,
    studentDetailCardData,
    studentDetailCardEnrollments,
    viewStudent,
  };
}

// ─── New component-level hook (extracted logic from StudentDetailCard component) ───

interface ConsentRecord {
  id: string;
  consent_type: string;
  status: string;
  signed_at: string | null;
  expires_at: string | null;
  created_at: string;
  policy_version?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  signed_by_name?: string | null;
}

interface PepAgreementRecord {
  id: string;
  agreement_version: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
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

export type { ConsentRecord, GeneratedConsentRecord, VerificationRecord, DocumentRecord, IdentityDocumentRecord };

interface EnrollmentInfo {
  id: string;
  course_id: string;
  course_title: string;
  progress: number;
  status: string;
  started_at: string;
  completed_at?: string | null;
  time_spent: number;
  access_days?: number | null;
  expires_at?: string | null;
}

export type { EnrollmentInfo };

interface UseStudentDetailCardLogicProps {
  isOpen: boolean;
  student: StudentCardData | null;
  organizationId: string;
  enrollments?: EnrollmentInfo[];
  onStudentUpdated?: () => void;
}

export function useStudentDetailCardLogic({
  isOpen, student, organizationId, enrollments = [], onStudentUpdated,
}: UseStudentDetailCardLogicProps) {
  const [activeTab, setActiveTab] = useState("profile");
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [pepAgreements, setPepAgreements] = useState<PepAgreementRecord[]>([]);
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
  const [selectedEnrollmentForFRDO, setSelectedEnrollmentForFRDO] = useState<EnrollmentInfo | null>(null);
  const [viewConsentDialog, setViewConsentDialog] = useState<GeneratedConsentRecord | null>(null);

  const [isEditingCredentials, setIsEditingCredentials] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [decryptedPassword, setDecryptedPassword] = useState<string | null>(null);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);

  // FRDO data state
  const [frdoData, setFrdoData] = useState<Record<string, string | null>>({});
  const [savingFrdoField, setSavingFrdoField] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && student) loadStudentData();
  }, [isOpen, student]);

  const loadStudentData = async () => {
    if (!student) return;
    setIsLoading(true);
    try {
      const [consentsRes, generatedConsentsRes, verificationsRes, documentsRes, identityDocsRes, frdoRes, pepRes] = await Promise.all([
        supabase.from("student_consents").select("*").eq("user_id", student.user_id).eq("organization_id", organizationId).order("created_at", { ascending: false }),
        supabase.from("consent_documents").select("*").eq("student_user_id", student.user_id).eq("organization_id", organizationId).order("created_at", { ascending: false }),
        supabase.from("video_identifications").select("*").eq("user_id", student.user_id).order("created_at", { ascending: false }),
        supabase.from("student_documents").select("*, enrollments!inner(user_id)").eq("enrollments.user_id", student.user_id).order("created_at", { ascending: false }),
        supabase.from("student_identity_documents").select("*").eq("user_id", student.user_id).eq("organization_id", organizationId).order("created_at", { ascending: false }),
        supabase.from("student_frdo_data").select("*").eq("user_id", student.user_id).eq("organization_id", organizationId).maybeSingle(),
        supabase.from("pep_agreements").select("id, agreement_version, accepted_at, ip_address, user_agent").eq("user_id", student.user_id).eq("organization_id", organizationId).order("accepted_at", { ascending: false }),
      ]);
      if (consentsRes.data) setConsents(consentsRes.data as ConsentRecord[]);
      if (generatedConsentsRes.data) setGeneratedConsents(generatedConsentsRes.data as GeneratedConsentRecord[]);
      if (verificationsRes.data) setVerifications(verificationsRes.data as VerificationRecord[]);
      if (documentsRes.data) setDocuments(documentsRes.data as DocumentRecord[]);
      if (identityDocsRes.data) setIdentityDocs(identityDocsRes.data as IdentityDocumentRecord[]);
      if (frdoRes.data) setFrdoData(frdoRes.data as Record<string, string | null>);
      else setFrdoData({});
      if (pepRes.data) setPepAgreements(pepRes.data as PepAgreementRecord[]);
    } catch (error) { console.error("Error loading student data:", error); }
    finally { setIsLoading(false); }
  };

  const saveFrdoField = async (field: string, value: string) => {
    if (!student) return;
    setSavingFrdoField(field);
    try {
      const { error } = await supabase.from("student_frdo_data").upsert({
        user_id: student.user_id,
        organization_id: organizationId,
        [field]: value || null,
      }, { onConflict: "user_id,organization_id" });
      if (error) throw error;
      setFrdoData(prev => ({ ...prev, [field]: value || null }));
      toast.success("Сохранено");
    } catch (error) { console.error("Save FRDO field error:", error); toast.error("Ошибка сохранения"); }
    finally { setSavingFrdoField(null); }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 2000); toast.success("Скопировано"); } catch { toast.error("Не удалось скопировать"); }
  };

  const handleUpdateCredentials = async () => {
    if (!student) return;
    if (!newLogin && !newPassword) { toast.error("Укажите новый логин или пароль"); return; }
    setIsUpdatingCredentials(true);
    try {
      const { data, error } = await safeInvoke<any>('update-student-credentials', { body: { user_id: student.user_id, new_login: newLogin || undefined, new_password: newPassword || undefined } });
      if (error) throw error; if (data?.error) throw new Error(data.error);
      toast.success("Учетные данные обновлены"); setIsEditingCredentials(false); setNewLogin(""); setNewPassword(""); onStudentUpdated?.();
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Ошибка обновления"); }
    finally { setIsUpdatingCredentials(false); }
  };

  const handleUpdateFullName = async () => {
    if (!student) return;
    const trimmed = (newFullName || "").trim();
    if (!trimmed) { toast.error("ФИО не может быть пустым"); return; }
    if (trimmed.length > 100) { toast.error("ФИО не должно превышать 100 символов"); return; }
    setIsUpdatingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: trimmed })
        .eq("user_id", student.user_id);
      if (error) throw error;
      toast.success("ФИО обновлено");
      setIsEditingName(false);
      onStudentUpdated?.();
    } catch (error: unknown) {
      console.error("Update full_name error:", error);
      toast.error(error instanceof Error ? error.message : "Ошибка обновления ФИО");
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleUploadClick = (docType: string) => { setSelectedDocType(docType); fileInputRef.current?.click(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !student || !selectedDocType) return;
    setUploadingType(selectedDocType);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${student.user_id}/${selectedDocType}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("student-documents").upload(fileName, file);
      if (uploadError) throw uploadError;
      const docNames: Record<string, string> = { passport: "Паспорт", birth_certificate: "Свидетельство о рождении", snils: "СНИЛС", education_document: "Документ об образовании" };
      const { error: insertError } = await supabase.from("student_identity_documents").insert({ user_id: student.user_id, organization_id: organizationId, type: selectedDocType, name: docNames[selectedDocType] || file.name, file_url: fileName, file_path: fileName });
      if (insertError) throw insertError;
      toast.success("Документ загружен"); loadStudentData();
    } catch (error) { console.error("Error uploading:", error); toast.error("Ошибка загрузки"); }
    finally { setUploadingType(null); setSelectedDocType(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleDeleteIdentityDoc = async (doc: IdentityDocumentRecord) => {
    try {
      if (doc.file_url) { const path = extractStoragePath(doc.file_url, "student-documents"); if (path) await supabase.storage.from("student-documents").remove([path]); }
      const { error } = await supabase.from("student_identity_documents").delete().eq("id", doc.id);
      if (error) throw error; toast.success("Документ удалён"); loadStudentData();
    } catch (error) { console.error("Error deleting:", error); toast.error("Ошибка удаления"); }
  };

  const handlePreviewDoc = async (doc: IdentityDocumentRecord | DocumentRecord) => {
    if (!doc.file_url) return;
    const ext = doc.file_url.split('.').pop()?.toLowerCase()?.split('?')[0] || '';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
    const isPdf = ext === 'pdf';
    setIsLoadingPreview(true);
    try {
      const storagePath = extractStoragePath(doc.file_url, "student-documents");
      const signedUrl = await getSignedStorageUrl("student-documents", storagePath);
      if (!signedUrl) { toast.error("Не удалось получить доступ"); return; }
      if (isImage) { const r = await fetch(signedUrl); const b = await r.blob(); setPreviewDoc({ url: URL.createObjectURL(b), name: doc.name, type: 'image', originalUrl: signedUrl }); }
      else if (isPdf) { setPreviewDoc({ url: signedUrl, name: doc.name, type: 'pdf', originalUrl: signedUrl }); }
      else { handleDownloadDoc(signedUrl, doc.name); }
    } catch (error) { console.error("Preview error:", error); toast.error("Ошибка предпросмотра"); }
    finally { setIsLoadingPreview(false); }
  };

  const handleDownloadDoc = async (url: string, name: string) => {
    try { const r = await fetch(url); const b = await r.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href); }
    catch { window.open(url, '_blank'); }
  };

  const formatDate = (dateStr: string) => format(new Date(dateStr), "d MMMM yyyy, HH:mm", { locale: ru });
  const formatDuration = (seconds: number) => { const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); return h > 0 ? `${h} ч ${m} мин` : `${m} мин`; };

  const latestConsent = consents[0];
  const latestPepAgreement = pepAgreements[0];
  const latestVerification = verifications[0];
  const getIdentityDocByType = (type: string) => identityDocs.find(d => d.type === type);

  const getMissingDocuments = () => {
    const req = [{ type: "passport", label: "Паспорт или свидетельство о рождении" }, { type: "snils", label: "СНИЛС" }, { type: "education_document", label: "Документ об образовании" }];
    return req.filter(doc => {
      if (doc.type === "passport") return !identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate");
      if (doc.type === "education_document") return !identityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat");
      return !identityDocs.some(d => d.type === doc.type);
    });
  };

  const handleSendDocumentsReminder = async () => {
    if (!student) return;
    const missingDocs = getMissingDocuments();
    if (missingDocs.length === 0) { toast.info("Все документы загружены"); return; }
    setIsSendingReminder(true);
    try {
      const { data: orgData } = await supabase.from("organizations").select("name").eq("id", organizationId).single();
      const response = await safeInvoke<any>("send-documents-reminder", { body: { email: student.email, studentName: student.name, missingDocuments: missingDocs.map(d => d.label), organizationName: orgData?.name || "", loginUrl: getBaseUrl() + "/login" } });
      if (response.error) throw response.error;
      toast.success("Уведомление отправлено на " + student.email);
    } catch (error) { console.error("Reminder error:", error); toast.error("Ошибка отправки"); }
    finally { setIsSendingReminder(false); }
  };

  const handleVerifyIdentification = async (id: string, action: "verify" | "reject", reason?: string) => {
    try {
      const updates: Record<string, unknown> = { status: action === "verify" ? "verified" : "rejected", verified_at: new Date().toISOString() };
      if (action === "reject" && reason) updates.rejection_reason = reason;
      const { error } = await supabase.from("video_identifications").update(updates).eq("id", id);
      if (error) throw error;
      await supabase.from("org_notifications").insert({ organization_id: organizationId, user_id: student?.user_id || "", type: "video_identification", title: action === "verify" ? "Идентификация подтверждена" : "Идентификация отклонена", message: action === "verify" ? `Идентификация ${student?.name} подтверждена` : `Идентификация ${student?.name} отклонена: ${reason}`, related_id: id });
      toast.success(action === "verify" ? "Подтверждено" : "Отклонено"); loadStudentData();
    } catch (error) { console.error("Verify error:", error); toast.error("Ошибка обновления"); }
  };

  const handleManualVerification = async (verified: boolean) => {
    if (!student) return;
    try {
      if (verified) {
        if (latestVerification) { const { error } = await supabase.from("video_identifications").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", latestVerification.id); if (error) throw error; }
        else { const { error } = await supabase.from("video_identifications").insert({ user_id: student.user_id, organization_id: organizationId, status: "verified", verified_at: new Date().toISOString() }); if (error) throw error; }
        toast.success("Идентификация пройдена");
      } else {
        if (latestVerification) { const { error } = await supabase.from("video_identifications").update({ status: "pending", verified_at: null }).eq("id", latestVerification.id); if (error) throw error; toast.success("Статус сброшен"); }
      }
      loadStudentData(); onStudentUpdated?.();
    } catch (error) { console.error("Manual verify error:", error); toast.error("Ошибка обновления"); }
  };

  return {
    activeTab, setActiveTab, isLoading,
    consents, pepAgreements, latestPepAgreement, generatedConsents, verifications, documents, identityDocs,
    uploadingType, fileInputRef, previewDoc, setPreviewDoc, isLoadingPreview,
    isFRDODialogOpen, setIsFRDODialogOpen,
    selectedEnrollmentForFRDO, setSelectedEnrollmentForFRDO,
    viewConsentDialog, setViewConsentDialog,
    isEditingCredentials, setIsEditingCredentials, newLogin, setNewLogin, newPassword, setNewPassword,
    isUpdatingCredentials, copiedField, showPassword, setShowPassword,
    isEditingName, setIsEditingName, newFullName, setNewFullName, isUpdatingName, handleUpdateFullName,
    handleUpdateCredentials, copyToClipboard,
    handleUploadClick, handleFileChange, handleDeleteIdentityDoc, handlePreviewDoc, handleDownloadDoc,
    formatDate, formatDuration, latestConsent, latestVerification, getIdentityDocByType, getMissingDocuments,
    isSendingReminder, handleSendDocumentsReminder, handleVerifyIdentification, handleManualVerification,
    frdoData, saveFrdoField, savingFrdoField,
  };
}
