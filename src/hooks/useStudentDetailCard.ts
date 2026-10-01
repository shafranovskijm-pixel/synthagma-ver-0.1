import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { studentCredentialsText } from "@/utils/credentialPrivacy";
import { getSignedStorageUrl, extractStoragePath } from "@/utils/storageHelpers";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Student } from "@/types/shared";
import { useStaffPermissions } from "@/hooks/useStaffPermissions";
import { normalizeStudentRegistrationDetails } from "../../supabase/functions/_shared/student-registration-details";
import { useUrlQueryState } from "@/hooks/useUrlNavigation";

// ─── Dashboard-level useStudentDetailCard() hook removed in phase 4B.1.c.1.
// The organization dashboard now navigates to /organization/student/:id via
// tabNavigation.openStudentDetails, so the old open/close state is dead code.
// Only useStudentDetailCardLogic (component-level logic used by the full-page
// StudentDetailsTab / OrganizationStudentDetails / AdminUserDetails) remains
// below.

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
  /**
   * Phase 4B.1.c.2.b — fired after identity documents are added / removed.
   * Callers should invalidate document-related org queries here without
   * touching enrollment / course-overview keys.
   */
  onStudentDocumentsUpdated?: () => void;
}

export function useStudentDetailCardLogic({
  isOpen, student, organizationId, enrollments = [], onStudentUpdated, onStudentDocumentsUpdated,
}: UseStudentDetailCardLogicProps) {
  const { can, loading: permissionsLoading } = useStaffPermissions();
  const canManageLoginLinks = !permissionsLoading && can("students.write");
  const identityKey = isOpen && student?.user_id && organizationId
    ? `${organizationId}:${student.user_id}`
    : null;
  const activeIdentityKeyRef = useRef<string | null>(identityKey);
  const studentDataLoadSequenceRef = useRef(0);
  const tokenLoadSequenceRef = useRef(0);
  // Update during render so an already-resolved A request cannot commit in the
  // interval before the B effect cleanup runs.
  activeIdentityKeyRef.current = identityKey;

  const [activeTab, setActiveTab] = useUrlQueryState<string>("studentSection", "profile", [
    "profile", "identification", "courses", "documents", "activity", "testing", "chat",
  ]);
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
  const [decryptedPasswordResult, setDecryptedPasswordResult] = useState<{
    identityKey: string;
    value: string | null;
  } | null>(null);
  const [isLoadingPassword, setIsLoadingPassword] = useState(false);
  const [autoLoginTokenResult, setAutoLoginTokenResult] = useState<{
    identityKey: string;
    value: string | null;
  } | null>(null);
  const [isLoginLinkBusy, setIsLoginLinkBusy] = useState(false);
  const loginLinkActionRef = useRef<object | null>(null);
  const tokenRequestRef = useRef<{ identityKey: string; promise: Promise<string | null> } | null>(null);
  const [copyLinkFallback, setCopyLinkFallback] = useState<{ identityKey: string; url: string } | null>(null);
  const [loadedIdentityKey, setLoadedIdentityKey] = useState<string | null>(null);
  const [studentDataLoadError, setStudentDataLoadError] = useState<string | null>(null);

  const decryptedPassword = decryptedPasswordResult?.identityKey === identityKey
    ? decryptedPasswordResult.value
    : null;
  const autoLoginToken = autoLoginTokenResult?.identityKey === identityKey
    ? autoLoginTokenResult.value
    : null;

  // FRDO data state
  const [frdoData, setFrdoData] = useState<Record<string, string | null>>({});
  const [savingFrdoField, setSavingFrdoField] = useState<string | null>(null);
  const [phone, setPhone] = useState<string>("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [region, setRegion] = useState<string>("");
  const [savingRegion, setSavingRegion] = useState(false);
  const [jobPosition, setJobPosition] = useState<string>("");
  const [savingJobPosition, setSavingJobPosition] = useState(false);
  const [department, setDepartment] = useState("");
  const [savingDepartment, setSavingDepartment] = useState(false);
  const departmentSaveSequenceRef = useRef(0);
  const departmentSavePendingRef = useRef<string | null>(null);

  // Block/unblock state
  const [blockedAt, setBlockedAt] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [isTogglingBlock, setIsTogglingBlock] = useState(false);


  const resetLoadedStudentData = useCallback(() => {
    setLoadedIdentityKey(null);
    setStudentDataLoadError(null);
    setConsents([]);
    setPepAgreements([]);
    setGeneratedConsents([]);
    setVerifications([]);
    setDocuments([]);
    setIdentityDocs([]);
    setFrdoData({});
    setPhone("");
    setRegion("");
    setJobPosition("");
    setDepartment("");
    setBlockedAt(null);
    setBlockedReason(null);
  }, []);

  const resetStudentIdentityState = useCallback(() => {
    resetLoadedStudentData();
    setUploadingType(null);
    setSelectedDocType(null);
    setPreviewDoc(null);
    setIsLoadingPreview(false);
    setIsFRDODialogOpen(false);
    setSelectedEnrollmentForFRDO(null);
    setViewConsentDialog(null);
    setIsEditingCredentials(false);
    setNewLogin("");
    setNewPassword("");
    setIsUpdatingCredentials(false);
    setIsEditingName(false);
    setNewFullName("");
    setIsUpdatingName(false);
    setCopiedField(null);
    setShowPassword(false);
    setIsSendingReminder(false);
    setDecryptedPasswordResult(null);
    setIsLoadingPassword(false);
    setAutoLoginTokenResult(null);
    setIsLoginLinkBusy(false);
    setSavingFrdoField(null);
    setSavingPhone(false);
    setSavingRegion(false);
    setSavingJobPosition(false);
    setSavingDepartment(false);
    departmentSaveSequenceRef.current += 1;
    departmentSavePendingRef.current = null;
    setIsTogglingBlock(false);
  }, [resetLoadedStudentData]);

  const loadStudentData = useCallback(async () => {
    const requestIdentityKey = identityKey;
    const requestUserId = student?.user_id;
    const requestOrganizationId = organizationId;
    if (!requestIdentityKey || !requestUserId || !requestOrganizationId) return;

    const requestSequence = ++studentDataLoadSequenceRef.current;
    const isCurrentRequest = () => (
      studentDataLoadSequenceRef.current === requestSequence
      && activeIdentityKeyRef.current === requestIdentityKey
    );

    resetLoadedStudentData();
    setDecryptedPasswordResult(null);
    setIsLoading(true);
    setIsLoadingPassword(true);

    try {
      const [consentsRes, generatedConsentsRes, verificationsRes, documentsRes, identityDocsRes, frdoRes, pepRes, profileRes] = await Promise.all([
        supabase.from("student_consents").select("*").eq("user_id", requestUserId).eq("organization_id", requestOrganizationId).order("created_at", { ascending: false }),
        supabase.from("consent_documents").select("*").eq("student_user_id", requestUserId).eq("organization_id", requestOrganizationId).order("created_at", { ascending: false }),
        supabase.from("video_identifications").select("*").eq("user_id", requestUserId).eq("organization_id", requestOrganizationId).order("created_at", { ascending: false }),
        supabase.from("student_documents").select("*, enrollments!inner(user_id, courses!inner(organization_id))").eq("enrollments.user_id", requestUserId).eq("enrollments.courses.organization_id", requestOrganizationId).order("created_at", { ascending: false }),
        supabase.from("student_identity_documents").select("*").eq("user_id", requestUserId).eq("organization_id", requestOrganizationId).order("created_at", { ascending: false }),
        supabase.from("student_frdo_data").select("*").eq("user_id", requestUserId).eq("organization_id", requestOrganizationId).maybeSingle(),
        supabase.from("pep_agreements").select("id, agreement_version, accepted_at, ip_address, user_agent").eq("user_id", requestUserId).eq("organization_id", requestOrganizationId).order("accepted_at", { ascending: false }),
        supabase.from("profiles").select("phone, region, job_position, department, blocked_at, blocked_reason").eq("user_id", requestUserId).eq("organization_id", requestOrganizationId).maybeSingle(),
      ]);

      if (!isCurrentRequest()) return;
      const requiredQueryResults: Array<readonly [string, { error: unknown }]> = [
        ["согласия", consentsRes],
        ["сформированные согласия", generatedConsentsRes],
        ["идентификация", verificationsRes],
        ["документы обучения", documentsRes],
        ["личные документы", identityDocsRes],
        ["данные ФИС ФРДО", frdoRes],
        ["соглашения ПЭП", pepRes],
        ["профиль", profileRes],
      ];
      const failedQueries = requiredQueryResults.filter(([, result]) => result.error);
      if (failedQueries.length > 0) {
        console.error(
          "[useStudentDetailCard] required queries failed:",
          failedQueries.map(([name, result]) => ({ name, error: result.error })),
        );
        throw new Error("Не удалось подтвердить данные личного дела ученика");
      }
      setConsents((consentsRes.data || []) as ConsentRecord[]);
      setGeneratedConsents((generatedConsentsRes.data || []) as GeneratedConsentRecord[]);
      setVerifications((verificationsRes.data || []) as VerificationRecord[]);
      setDocuments((documentsRes.data || []) as unknown as DocumentRecord[]);
      setIdentityDocs((identityDocsRes.data || []) as IdentityDocumentRecord[]);
      setFrdoData((frdoRes.data || {}) as Record<string, string | null>);
      setPepAgreements((pepRes.data || []) as PepAgreementRecord[]);
      setPhone((profileRes.data as any)?.phone || "");
      setRegion((profileRes.data as any)?.region || "");
      setJobPosition((profileRes.data as any)?.job_position || "");
      setDepartment(profileRes.data?.department || "");
      setBlockedAt((profileRes.data as any)?.blocked_at || null);
      setBlockedReason((profileRes.data as any)?.blocked_reason || null);
      setLoadedIdentityKey(requestIdentityKey);
    } catch (error) {
      if (isCurrentRequest()) {
        console.error("Error loading student data:", error);
        setStudentDataLoadError(
          "Не удалось подтвердить данные личного дела. Мы не показываем пустые документы вместо ошибки.",
        );
        setIsLoadingPassword(false);
      }
      return;
    } finally {
      if (isCurrentRequest()) setIsLoading(false);
    }

    if (!isCurrentRequest()) return;
    try {
      const { data: pw, error: pwErr } = await supabase.rpc("get_decrypted_student_password", {
        p_user_id: requestUserId,
      });
      if (!isCurrentRequest()) return;
      if (pwErr) console.warn("decrypt password error:", pwErr);
      setDecryptedPasswordResult({
        identityKey: requestIdentityKey,
        value: pwErr ? null : (pw as string) || null,
      });
    } catch (error) {
      if (!isCurrentRequest()) return;
      console.warn("decrypt password exception:", error);
      setDecryptedPasswordResult({ identityKey: requestIdentityKey, value: null });
    } finally {
      if (isCurrentRequest()) setIsLoadingPassword(false);
    }
  }, [identityKey, organizationId, resetLoadedStudentData, student?.user_id]);

  useEffect(() => {
    studentDataLoadSequenceRef.current += 1;
    tokenLoadSequenceRef.current += 1;
    resetStudentIdentityState();
    if (!identityKey) {
      setIsLoading(false);
      return;
    }
    void loadStudentData();
    return () => {
      studentDataLoadSequenceRef.current += 1;
      tokenLoadSequenceRef.current += 1;
    };
  }, [identityKey, loadStudentData, resetStudentIdentityState]);

  // The dedicated endpoint authorizes owners as well as permitted staff. It
  // never sends mail; a read failure must never become permission to create.
  const requestLoginToken = useCallback(async (action: "get" | "create"): Promise<string | null> => {
    const requestIdentityKey = identityKey;
    const requestSequence = tokenLoadSequenceRef.current;
    if (!requestIdentityKey || !student?.user_id || activeIdentityKeyRef.current !== requestIdentityKey) return null;
    const { data, error } = await safeInvoke<{ token: string | null; user_id: string; organization_id: string; error?: string }>("student-login-link", {
      body: { action, user_id: student.user_id, organization_id: organizationId },
    });
    if (error || data?.error) throw error || new Error(data?.error);
    if (!data || data.user_id !== student.user_id || data.organization_id !== organizationId
        || (data.token !== null && (typeof data.token !== "string" || !data.token))) {
      throw new Error("Не удалось подтвердить ссылку ученика");
    }
    if (action === "create" && !data.token) throw new Error("Не удалось создать ссылку");
    if (activeIdentityKeyRef.current === requestIdentityKey && tokenLoadSequenceRef.current === requestSequence) {
      setAutoLoginTokenResult({ identityKey: requestIdentityKey, value: data.token });
    }
    return data.token;
  }, [identityKey, organizationId, student?.user_id]);

  useEffect(() => {
    ++tokenLoadSequenceRef.current;
    const requestIdentityKey = identityKey;
    setAutoLoginTokenResult(null);
    setCopyLinkFallback(null);
    loginLinkActionRef.current = null;
    setIsLoginLinkBusy(false);
    if (!requestIdentityKey || !canManageLoginLinks) return;
    const request = { identityKey: requestIdentityKey, promise: requestLoginToken("get") };
    tokenRequestRef.current = request;
    // The action displays a useful error on retry. Do not show a toast simply
    // because the user opened a card without access to credential management.
    void request.promise.catch(() => {}).finally(() => {
      if (tokenRequestRef.current === request) tokenRequestRef.current = null;
    });
  }, [identityKey, requestLoginToken, canManageLoginLinks]);

  const ensureAutoLoginToken = useCallback(async (): Promise<string | null> => {
    const requestIdentityKey = identityKey;
    const requestSequence = tokenLoadSequenceRef.current;
    if (!requestIdentityKey || activeIdentityKeyRef.current !== requestIdentityKey) return null;
    if (autoLoginToken) return autoLoginToken;
    const pending = tokenRequestRef.current;
    if (pending?.identityKey === requestIdentityKey) {
      const loaded = await pending.promise;
      if (loaded) return loaded;
    }
    if (activeIdentityKeyRef.current !== requestIdentityKey || tokenLoadSequenceRef.current !== requestSequence) return null;
    return requestLoginToken("create");
  }, [autoLoginToken, identityKey, requestLoginToken]);

  const copyAutoLoginLink = useCallback(async () => {
    const requestIdentityKey = identityKey;
    const requestSequence = tokenLoadSequenceRef.current;
    const isCurrentRequest = () => activeIdentityKeyRef.current === requestIdentityKey && tokenLoadSequenceRef.current === requestSequence;
    if (!requestIdentityKey || activeIdentityKeyRef.current !== requestIdentityKey || loginLinkActionRef.current) return;
    if (permissionsLoading || !can("students.write")) { toast.error("Недостаточно прав для управления ссылкой ученика"); return; }
    const action = {};
    loginLinkActionRef.current = action;
    setIsLoginLinkBusy(true);
    try {
      // Do not yield before clipboard.writeText when the token is already loaded.
      const t = autoLoginToken || await ensureAutoLoginToken();
      if (!t || !isCurrentRequest()) return;
      const url = `${getBaseUrl()}/auto-login?token=${encodeURIComponent(t)}`;
      try {
        await navigator.clipboard.writeText(url);
        if (isCurrentRequest()) {
          setCopyLinkFallback(null);
          toast.success("Ссылка автовхода скопирована");
        }
      } catch {
        if (isCurrentRequest()) {
          setCopyLinkFallback({ identityKey: requestIdentityKey, url });
          toast.error("Браузер запретил копирование. Скопируйте ссылку из поля ниже.");
        }
      }
    } catch (error) {
      if (isCurrentRequest()) toast.error(error instanceof Error ? error.message : "Не удалось создать ссылку");
    } finally {
      if (loginLinkActionRef.current === action) { loginLinkActionRef.current = null; setIsLoginLinkBusy(false); }
    }
  }, [autoLoginToken, can, ensureAutoLoginToken, identityKey, permissionsLoading]);

  const copyCredentialsLink = useCallback(async () => {
    if (!student?.login) { toast.error("У ученика нет логина"); return; }
    const pw = decryptedPassword || (student.generated_password && !student.generated_password.startsWith("ENC:") ? student.generated_password : null);
    if (!pw) { toast.error("Пароль недоступен. Задайте новый пароль через «Изменить»."); return; }
    await navigator.clipboard.writeText(studentCredentialsText(getBaseUrl(), student.login, pw));
    toast.success("Данные входа скопированы. Передавайте их только лично ученику.");
  }, [student, decryptedPassword]);

  const sendLoginLinkEmail = useCallback(async () => {
    const requestIdentityKey = identityKey;
    const requestStudent = student;
    if (!requestIdentityKey || !requestStudent) return;
    if (!requestStudent.email) { toast.error("У ученика не указан email"); return; }
    setIsLoginLinkBusy(true);
    try {
      const { data, error } = await safeInvoke<any>("send-student-login-link", { body: { user_id: requestStudent.user_id } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Ссылка отправлена на ${requestStudent.email}`);
      // Refresh token if newly created
      if (activeIdentityKeyRef.current === requestIdentityKey) await requestLoginToken("get").catch(() => {});
    } catch (e: any) {
      toast.error(e?.message || "Ошибка отправки");
    } finally { setIsLoginLinkBusy(false); }
  }, [identityKey, requestLoginToken, student]);

  const revokeAutoLoginToken = useCallback(async () => {
    const requestIdentityKey = identityKey;
    const requestSequence = tokenLoadSequenceRef.current;
    const isCurrentRequest = () => activeIdentityKeyRef.current === requestIdentityKey && tokenLoadSequenceRef.current === requestSequence;
    if (!student || !autoLoginToken || !requestIdentityKey || activeIdentityKeyRef.current !== requestIdentityKey || loginLinkActionRef.current) return;
    if (permissionsLoading || !can("students.write")) { toast.error("Недостаточно прав для управления ссылкой ученика"); return; }
    if (!confirm("Отозвать ссылку автовхода? Старая ссылка перестанет работать.")) return;
    const action = {};
    loginLinkActionRef.current = action;
    setIsLoginLinkBusy(true);
    try {
      const { data, error } = await safeInvoke<{ revoked: boolean; user_id: string; organization_id: string }>("student-login-link", {
        body: { action: "revoke", user_id: student.user_id, organization_id: organizationId, token: autoLoginToken },
      });
      if (error) throw error;
      if (!data?.revoked || data.user_id !== student.user_id || data.organization_id !== organizationId) throw new Error("Не удалось подтвердить отзыв ссылки");
      if (isCurrentRequest()) {
        setAutoLoginTokenResult({ identityKey: requestIdentityKey, value: null });
        setCopyLinkFallback(null);
        toast.success("Ссылка отозвана");
      }
    } catch (error) {
      if (isCurrentRequest()) toast.error(error instanceof Error ? error.message : "Не удалось отозвать ссылку");
    } finally {
      if (loginLinkActionRef.current === action) { loginLinkActionRef.current = null; setIsLoginLinkBusy(false); }
    }
  }, [autoLoginToken, can, identityKey, organizationId, permissionsLoading, student]);


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

  const savePhone = async (value: string) => {
    if (!student) return;
    setSavingPhone(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ phone: value || null })
        .eq("user_id", student.user_id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      setPhone(value);
      toast.success("Телефон сохранён");
    } catch (error) { console.error("Save phone error:", error); toast.error("Ошибка сохранения телефона"); }
    finally { setSavingPhone(false); }
  };

  const saveRegion = async (value: string) => {
    if (!student) return;
    setSavingRegion(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ region: value || null })
        .eq("user_id", student.user_id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      setRegion(value);
      toast.success("Регион сохранён");
    } catch (error) { console.error("Save region error:", error); toast.error("Ошибка сохранения региона"); }
    finally { setSavingRegion(false); }
  };


  const saveJobPosition = async (value: string) => {
    if (!student) return;
    setSavingJobPosition(true);
    try {
      // Fail closed: без organizationId запись не выполняется вовсе — unscoped
      // update по одному user_id недопустим.
      if (!organizationId) {
        toast.error("Организация не определена — должность не сохранена");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ job_position: value || null } as any)
        .eq("user_id", student.user_id)
        .eq("organization_id", organizationId);
      if (error) throw error;
      setJobPosition(value);
      toast.success("Должность сохранена");
    } catch (error) { console.error("Save job position error:", error); toast.error("Ошибка сохранения должности"); }
    finally { setSavingJobPosition(false); }
  };

  const saveDepartment = async (value: string): Promise<boolean> => {
    const requestIdentityKey = identityKey;
    const requestUserId = student?.user_id;
    const requestOrganizationId = organizationId;
    if (!requestIdentityKey || !requestUserId || !requestOrganizationId || !hasCurrentIdentityData
      || activeIdentityKeyRef.current !== requestIdentityKey) {
      toast.error("Сначала повторите загрузку личного дела ученика");
      return false;
    }
    if (permissionsLoading || !can("students.write")) {
      toast.error("Нет доступа к изменению учеников");
      return false;
    }
    if (departmentSavePendingRef.current === requestIdentityKey) return false;

    const requestSequence = ++departmentSaveSequenceRef.current;
    const isCurrentRequest = () => activeIdentityKeyRef.current === requestIdentityKey
      && departmentSaveSequenceRef.current === requestSequence;
    departmentSavePendingRef.current = requestIdentityKey;
    setSavingDepartment(true);
    try {
      // Unlike import, an explicitly cleared field must remove the old value.
      const normalized = normalizeStudentRegistrationDetails({ department: value }).department || null;
      const { data, error } = await supabase.from("profiles")
        .update({ department: normalized })
        .eq("user_id", requestUserId)
        .eq("organization_id", requestOrganizationId)
        .select("user_id, organization_id, department")
        .single();
      if (error) throw error;
      if (!data || data.user_id !== requestUserId || data.organization_id !== requestOrganizationId
        || data.department !== normalized) {
        throw new Error("Не удалось подтвердить сохранение подразделения");
      }
      if (!isCurrentRequest()) return false;
      setDepartment(data.department || "");
      toast.success("Подразделение сохранено");
      onStudentUpdated?.();
      return true;
    } catch (error) {
      if (isCurrentRequest()) {
        console.error("Save department error:", error);
        toast.error(error instanceof Error ? error.message : "Не удалось сохранить подразделение");
      }
      return false;
    } finally {
      if (isCurrentRequest()) {
        departmentSavePendingRef.current = null;
        setSavingDepartment(false);
      }
    }
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
        .eq("user_id", student.user_id)
        .eq("organization_id", organizationId);
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
      toast.success("Документ загружен"); loadStudentData(); onStudentDocumentsUpdated?.();
    } catch (error) { console.error("Error uploading:", error); toast.error("Ошибка загрузки"); }
    finally { setUploadingType(null); setSelectedDocType(null); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const handleDeleteIdentityDoc = async (doc: IdentityDocumentRecord) => {
    try {
      if (doc.file_url) { const path = extractStoragePath(doc.file_url, "student-documents"); if (path) await supabase.storage.from("student-documents").remove([path]); }
      const { error } = await supabase.from("student_identity_documents").delete().eq("id", doc.id);
      if (error) throw error; toast.success("Документ удалён"); loadStudentData(); onStudentDocumentsUpdated?.();
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

  const hasCurrentIdentityData = !!identityKey
    && loadedIdentityKey === identityKey
    && !studentDataLoadError;
  const currentConsents = hasCurrentIdentityData ? consents : [];
  const currentPepAgreements = hasCurrentIdentityData ? pepAgreements : [];
  const currentGeneratedConsents = hasCurrentIdentityData ? generatedConsents : [];
  const currentVerifications = hasCurrentIdentityData ? verifications : [];
  const currentDocuments = hasCurrentIdentityData ? documents : [];
  const currentIdentityDocs = hasCurrentIdentityData ? identityDocs : [];
  const currentFrdoData = hasCurrentIdentityData ? frdoData : {};
  const latestConsent = currentConsents[0];
  const latestPepAgreement = currentPepAgreements[0];
  const latestVerification = currentVerifications[0];
  const getIdentityDocByType = (type: string) => currentIdentityDocs.find(d => d.type === type);

  const getMissingDocuments = () => {
    if (!hasCurrentIdentityData) return [];
    const req = [{ type: "passport", label: "Паспорт или свидетельство о рождении" }, { type: "snils", label: "СНИЛС" }, { type: "education_document", label: "Документ об образовании" }];
    return req.filter(doc => {
      if (doc.type === "passport") return !currentIdentityDocs.some(d => d.type === "passport" || d.type === "birth_certificate");
      if (doc.type === "education_document") return !currentIdentityDocs.some(d => d.type === "education_document" || d.type === "diploma" || d.type === "attestat");
      return !currentIdentityDocs.some(d => d.type === doc.type);
    });
  };

  const handleSendDocumentsReminder = async () => {
    if (!student) return;
    if (!hasCurrentIdentityData) {
      toast.error("Сначала повторите загрузку личного дела ученика");
      return;
    }
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

  const handleToggleBlock = async (block: boolean, reason?: string) => {
    if (!student) return;
    setIsTogglingBlock(true);
    try {
      const { error } = await supabase.rpc('set_student_blocked', {
        _target_user_id: student.user_id,
        _blocked: block,
        _reason: reason ?? null,
      });
      if (error) throw error;
      if (block) {
        setBlockedAt(new Date().toISOString());
        setBlockedReason(reason ?? null);
        toast.success("Ученик заблокирован");
      } else {
        setBlockedAt(null);
        setBlockedReason(null);
        toast.success("Ученик разблокирован");
      }
      onStudentUpdated?.();
    } catch (e: any) {
      console.error("Toggle block error:", e);
      toast.error(e?.message || "Ошибка изменения статуса блокировки");
    } finally {
      setIsTogglingBlock(false);
    }
  };

  return {
    activeTab, setActiveTab,
    isLoading: !!identityKey && !studentDataLoadError && (isLoading || !hasCurrentIdentityData),
    dataLoadError: identityKey ? studentDataLoadError : null,
    retryLoadStudentData: loadStudentData,
    consents: currentConsents,
    pepAgreements: currentPepAgreements,
    latestPepAgreement,
    generatedConsents: currentGeneratedConsents,
    verifications: currentVerifications,
    documents: currentDocuments,
    identityDocs: currentIdentityDocs,
    uploadingType, fileInputRef,
    previewDoc: hasCurrentIdentityData ? previewDoc : null,
    setPreviewDoc,
    isLoadingPreview: hasCurrentIdentityData && isLoadingPreview,
    isFRDODialogOpen: hasCurrentIdentityData && isFRDODialogOpen,
    setIsFRDODialogOpen,
    selectedEnrollmentForFRDO: hasCurrentIdentityData ? selectedEnrollmentForFRDO : null,
    setSelectedEnrollmentForFRDO,
    viewConsentDialog: hasCurrentIdentityData ? viewConsentDialog : null,
    setViewConsentDialog,
    isEditingCredentials, setIsEditingCredentials, newLogin, setNewLogin, newPassword, setNewPassword,
    isUpdatingCredentials, copiedField, showPassword, setShowPassword,
    decryptedPassword,
    isLoadingPassword: !!identityKey && (
      isLoadingPassword || decryptedPasswordResult?.identityKey !== identityKey
    ),
    isEditingName, setIsEditingName, newFullName, setNewFullName, isUpdatingName, handleUpdateFullName,
    handleUpdateCredentials, copyToClipboard,
    handleUploadClick, handleFileChange, handleDeleteIdentityDoc, handlePreviewDoc, handleDownloadDoc,
    formatDate, formatDuration, latestConsent, latestVerification, getIdentityDocByType, getMissingDocuments,
    isSendingReminder, handleSendDocumentsReminder, handleVerifyIdentification, handleManualVerification,
    frdoData: currentFrdoData, saveFrdoField, savingFrdoField,
    phone: hasCurrentIdentityData ? phone : "", savePhone, savingPhone,
    region: hasCurrentIdentityData ? region : "", saveRegion, savingRegion,
    jobPosition: hasCurrentIdentityData ? jobPosition : "", saveJobPosition, savingJobPosition,
    department: hasCurrentIdentityData ? department : "", saveDepartment, savingDepartment,
    autoLoginToken: hasCurrentIdentityData ? autoLoginToken : null,
    autoLoginCopyFallback: hasCurrentIdentityData && copyLinkFallback?.identityKey === identityKey ? copyLinkFallback.url : null,
    isLoginLinkBusy,
    copyAutoLoginLink, copyCredentialsLink, sendLoginLinkEmail, revokeAutoLoginToken,
    blockedAt: hasCurrentIdentityData ? blockedAt : null,
    blockedReason: hasCurrentIdentityData ? blockedReason : null,
    isTogglingBlock,
    handleToggleBlock,
  };
}

