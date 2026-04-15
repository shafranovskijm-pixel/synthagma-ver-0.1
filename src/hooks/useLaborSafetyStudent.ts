import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { openPrivateFile, extractStoragePath } from "@/utils/storageHelpers";
import { toast } from "sonner";

interface LaborSafetyRecord {
  id: string;
  group_id: string;
  full_name: string;
  snils: string | null;
  position: string | null;
  inn: string | null;
  organization_name: string | null;
  protocol_number: string | null;
  program_name: string | null;
  exam_date: string | null;
  is_passed: boolean;
  created_at?: string;
}

export interface LaborSafetyProfile {
  id: string;
  user_id: string;
  full_name: string;
  login: string | null;
  generated_password: string | null;
  email: string | null;
  organization_id: string;
  record_id: string | null;
}

export interface LSCourse {
  id: string;
  title: string;
}

export interface LSEnrollment {
  id: string;
  course_id: string;
  course_title: string;
  progress: number;
  status: string;
  started_at: string;
  completed_at?: string | null;
}

export interface LSVerificationRecord {
  id: string;
  status: string;
  photo_url: string | null;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
}

export interface LSIdentityDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
}

export function useLaborSafetyStudent(
  isOpen: boolean,
  record: LaborSafetyRecord | null,
  organizationId: string,
  onRecordUpdated?: () => void,
) {
  const [activeTab, setActiveTab] = useState("profile");
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<LaborSafetyProfile | null>(null);
  const [enrollments, setEnrollments] = useState<LSEnrollment[]>([]);
  const [verifications, setVerifications] = useState<LSVerificationRecord[]>([]);
  const [identityDocs, setIdentityDocs] = useState<LSIdentityDocument[]>([]);
  const [availableCourses, setAvailableCourses] = useState<LSCourse[]>([]);

  const [isEditingCredentials, setIsEditingCredentials] = useState(false);
  const [newLogin, setNewLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isSendingCredentials, setIsSendingCredentials] = useState(false);

  useEffect(() => {
    if (isOpen && record) loadData();
  }, [isOpen, record]);

  const loadData = async () => {
    if (!record) return;
    setIsLoading(true);
    try {
      const { data: existingProfile, error: profileError } = await supabase
        .from("labor_safety_profiles").select("*").eq("record_id", record.id).eq("organization_id", organizationId).maybeSingle();
      if (profileError && profileError.code !== 'PGRST116') throw profileError;

      if (existingProfile) {
        let profileData = existingProfile;
        if (!existingProfile.generated_password && existingProfile.user_id) {
          const { data: decryptedPw } = await supabase.rpc("get_decrypted_student_password", { p_user_id: existingProfile.user_id });
          if (decryptedPw) {
            const { data: mainProfile } = await supabase.from("profiles").select("login").eq("user_id", existingProfile.user_id).maybeSingle();
            profileData = { ...existingProfile, generated_password: decryptedPw, login: existingProfile.login || mainProfile?.login };
            await supabase.from("labor_safety_profiles").update({ generated_password: decryptedPw, login: existingProfile.login || mainProfile?.login }).eq("id", existingProfile.id);
          }
        } else if (existingProfile.generated_password) {
          const { data: decryptedPw } = await supabase.rpc("get_decrypted_labor_password", { p_user_id: existingProfile.user_id });
          if (decryptedPw) profileData = { ...existingProfile, generated_password: decryptedPw };
        }
        setProfile(profileData);

        const { data: enrollmentData } = await supabase.from("enrollments").select("id, course_id, progress, status, started_at, completed_at, courses(title)").eq("user_id", existingProfile.user_id);
        if (enrollmentData) setEnrollments(enrollmentData.map((e: any) => ({ id: e.id, course_id: e.course_id, course_title: e.courses?.title || "Курс", progress: e.progress, status: e.status, started_at: e.started_at, completed_at: e.completed_at })));

        const { data: verificationData } = await supabase.from("video_identifications").select("*").eq("user_id", existingProfile.user_id).eq("organization_id", organizationId).order("created_at", { ascending: false });
        if (verificationData) setVerifications(verificationData);

        const { data: docsData } = await supabase.from("student_identity_documents").select("*").eq("user_id", existingProfile.user_id).eq("organization_id", organizationId).order("created_at", { ascending: false });
        if (docsData) setIdentityDocs(docsData);
      } else {
        setProfile(null); setEnrollments([]); setVerifications([]); setIdentityDocs([]);
      }

      const { data: categoryData } = await supabase.from("course_categories").select("id").eq("organization_id", organizationId).ilike("name", "%охрана труда%").maybeSingle();
      let coursesQuery = supabase.from("courses").select("id, title").eq("organization_id", organizationId).eq("is_published", true).order("title");
      if (categoryData?.id) coursesQuery = coursesQuery.eq("category_id", categoryData.id);
      const { data: coursesData } = await coursesQuery;
      if (coursesData) setAvailableCourses(coursesData);
    } catch (error) { console.error("Error loading data:", error); toast.error("Ошибка загрузки данных"); }
    finally { setIsLoading(false); }
  };

  const createProfileForRecord = async () => {
    if (!record) return;
    setIsCreatingProfile(true);
    try {
      const { data, error } = await safeInvoke<any>("register-student", { body: { organization_id: organizationId, full_name: record.full_name } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.user_id) {
        const { error: linkError } = await supabase.from("labor_safety_profiles").upsert({ user_id: data.user_id, full_name: record.full_name, login: data.login, generated_password: data.password || data.generated_password, email: data.email, organization_id: organizationId, record_id: record.id }, { onConflict: 'record_id' });
        if (linkError) throw linkError;
        toast.success("Учётная запись создана");
        loadData(); onRecordUpdated?.();
      }
    } catch (error: any) { toast.error(error.message || "Ошибка создания профиля"); }
    finally { setIsCreatingProfile(false); }
  };

  const sendCredentialsToUser = async () => {
    if (!profile || !profile.login) { toast.error("Нет учётных данных для отправки"); return; }
    setIsSendingCredentials(true);
    try {
      const { error } = await safeInvoke<any>("send-credentials", { body: { user_id: profile.user_id, organization_id: organizationId } });
      if (error) throw error;
      toast.success("Учётные данные отправлены на email");
    } catch (error: any) { toast.error(error.message || "Ошибка отправки"); }
    finally { setIsSendingCredentials(false); }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(() => setCopiedField(null), 2000); toast.success("Скопировано"); } catch { toast.error("Не удалось скопировать"); }
  };

  const handleUpdateCredentials = async () => {
    if (!profile) return;
    if (!newLogin && !newPassword) { toast.error("Укажите новый логин или пароль"); return; }
    setIsUpdatingCredentials(true);
    try {
      const { data, error } = await safeInvoke<any>('update-student-credentials', { body: { user_id: profile.user_id, new_login: newLogin || undefined, new_password: newPassword || undefined } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Учетные данные обновлены");
      setIsEditingCredentials(false); setNewLogin(""); setNewPassword("");
      loadData(); onRecordUpdated?.();
    } catch (error: any) { toast.error(error.message || "Ошибка обновления"); }
    finally { setIsUpdatingCredentials(false); }
  };

  const handleManualVerification = async (verified: boolean) => {
    if (!profile) return;
    try {
      const latest = verifications[0];
      if (verified) {
        if (latest) await supabase.from("video_identifications").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", latest.id);
        else await supabase.from("video_identifications").insert({ user_id: profile.user_id, organization_id: organizationId, status: "verified", verified_at: new Date().toISOString() });
        toast.success("Видеоидентификация отмечена как пройденная");
      } else {
        if (latest) { await supabase.from("video_identifications").update({ status: "pending", verified_at: null }).eq("id", latest.id); toast.success("Статус видеоидентификации сброшен"); }
      }
      loadData(); onRecordUpdated?.();
    } catch { toast.error("Ошибка обновления статуса"); }
  };

  const handleUploadClick = (docType: string) => { setSelectedDocType(docType); fileInputRef.current?.click(); };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile || !selectedDocType) return;
    setUploadingType(selectedDocType);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.user_id}/${selectedDocType}_${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("student-documents").upload(fileName, file);
      if (uploadError) throw uploadError;
      const docNames: Record<string, string> = { passport: "Паспорт", birth_certificate: "Свидетельство о рождении", snils: "СНИЛС", education_document: "Документ об образовании" };
      await supabase.from("student_identity_documents").insert({ user_id: profile.user_id, organization_id: organizationId, type: selectedDocType, name: docNames[selectedDocType] || file.name, file_url: fileName, file_path: fileName });
      toast.success("Документ загружен"); loadData();
    } catch { toast.error("Ошибка загрузки документа"); }
    finally { setUploadingType(null); setSelectedDocType(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleDeleteDoc = async (doc: LSIdentityDocument) => {
    try {
      if (doc.file_url) { const path = extractStoragePath(doc.file_url, "student-documents"); if (path) await supabase.storage.from("student-documents").remove([path]); }
      await supabase.from("student_identity_documents").delete().eq("id", doc.id);
      toast.success("Документ удалён"); loadData();
    } catch { toast.error("Ошибка удаления документа"); }
  };

  const handleEnrollToCourse = async () => {
    if (!profile || selectedCourseIds.length === 0) return;
    setIsEnrolling(true);
    try {
      let enrolledCount = 0, alreadyCount = 0;
      for (const courseId of selectedCourseIds) {
        const { data: existing } = await supabase.from("enrollments").select("id").eq("user_id", profile.user_id).eq("course_id", courseId).maybeSingle();
        if (existing) { alreadyCount++; continue; }
        await supabase.from("enrollments").insert({ user_id: profile.user_id, course_id: courseId, status: "active" });
        enrolledCount++;
      }
      if (enrolledCount > 0) toast.success(`Зачислен на ${enrolledCount} курс(ов)`);
      if (alreadyCount > 0) toast.info(`Уже зачислен на ${alreadyCount} курс(ов)`);
      setIsAddingCourse(false); setSelectedCourseIds([]); loadData();
    } catch { toast.error("Ошибка зачисления"); }
    finally { setIsEnrolling(false); }
  };

  const handleRemoveEnrollment = async (enrollmentId: string) => {
    try { await supabase.from("enrollments").delete().eq("id", enrollmentId); toast.success("Отчислен с курса"); loadData(); } catch { toast.error("Ошибка отчисления"); }
  };

  const handleResetProgress = async (enrollmentId: string, courseId: string) => {
    if (!profile) return;
    try {
      await supabase.from("enrollments").update({ progress: 0, status: "active", completed_at: null }).eq("id", enrollmentId);
      const { data: lessons } = await supabase.from("lessons").select("id").eq("course_id", courseId);
      if (lessons && lessons.length > 0) await supabase.from("lesson_progress").delete().eq("user_id", profile.user_id).in("lesson_id", lessons.map(l => l.id));
      toast.success("Прогресс сброшен"); loadData();
    } catch { toast.error("Ошибка сброса прогресса"); }
  };

  const handleSendDocReminder = async () => {
    if (!profile) return;
    setIsSendingReminder(true);
    try {
      const { error } = await safeInvoke<any>("send-documents-reminder", { body: { user_id: profile.user_id, organization_id: organizationId } });
      if (error) throw error;
      toast.success("Напоминание отправлено");
    } catch { toast.error("Ошибка отправки напоминания"); }
    finally { setIsSendingReminder(false); }
  };

  const latestVerification = verifications[0] || null;
  const enrolledCourseIds = new Set(enrollments.map(e => e.course_id));
  const coursesToEnroll = availableCourses.filter(c => !enrolledCourseIds.has(c.id));

  const checklistItems = [
    { id: "contract", label: "Договор", type: "contract", completed: identityDocs.some(d => d.type === "contract" || d.type === "agreement") },
    { id: "passport", label: "Паспорт / Св-во о рождении", type: "passport", completed: identityDocs.some(d => d.type === "passport" || d.type === "birth_certificate") },
    { id: "snils", label: "СНИЛС", type: "snils", completed: identityDocs.some(d => d.type === "snils") },
  ];

  return {
    activeTab, setActiveTab, isLoading, profile, enrollments, verifications, identityDocs,
    isEditingCredentials, setIsEditingCredentials, newLogin, setNewLogin, newPassword, setNewPassword,
    isUpdatingCredentials, copiedField, showPassword, setShowPassword,
    fileInputRef, uploadingType, isAddingCourse, setIsAddingCourse,
    selectedCourseIds, setSelectedCourseIds, isEnrolling, isSendingReminder,
    isCreatingProfile, isSendingCredentials,
    latestVerification, coursesToEnroll, checklistItems,
    createProfileForRecord, sendCredentialsToUser, copyToClipboard,
    handleUpdateCredentials, handleManualVerification, handleUploadClick,
    handleFileChange, handleDeleteDoc, handleEnrollToCourse,
    handleRemoveEnrollment, handleResetProgress, handleSendDocReminder,
  };
}
