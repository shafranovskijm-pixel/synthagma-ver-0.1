import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { createDocumentUploadOperation, saveDocumentUpload, getOrgDocumentState, isOrgDocumentReady, type DocumentUploadOperation } from "@/lib/orgDocumentLifecycle";

export interface OrgDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
  updated_at: string;
  issue_date?: string | null;
  expires_at?: string | null;
  status?: string | null;
  responsible_person?: string | null;
  deleted_at?: string | null;
  document_revision?: number;
  current_version_id?: string | null;
}

// Основные категории документов
export const REGULAR_CATEGORIES = [
  {
    id: "founding",
    title: "Учредительные документы",
    shortTitle: "Учредительные",
    icon: "Building2",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    documents: [
      { type: "charter", label: "Устав организации", required: true },
      { type: "license", label: "Лицензия на осуществление образовательной деятельности (с приложениями)", required: true },
      { type: "registration", label: "Свидетельство о государственной регистрации юридического лица", required: true },
    ],
  },
  {
    id: "lna_main",
    title: "Локальные нормативные акты",
    shortTitle: "ЛНА",
    icon: "Scale",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    documents: [
      { type: "admission_rules", label: "Правила приема на обучение по программам ДПО и ПО", required: true },
      { type: "edu_activity_order", label: "Порядок организации и осуществления образовательной деятельности по дополнительным профессиональным программам", required: true },
      { type: "attestation_rules", label: "Положение о формах, периодичности и порядке текущего контроля успеваемости, промежуточной и итоговой аттестации", required: true },
      { type: "edu_relations", label: "Порядок оформления возникновения, приостановления и прекращения образовательных отношений", required: true },
      { type: "expulsion_rules", label: "Правила отчисления, перевода и восстановления обучающихся", required: true },
      { type: "program_dev_rules", label: "Положение о порядке разработки и утверждения дополнительных профессиональных программ", required: true },
      { type: "vsoko", label: "Положение о внутренней системе оценки качества образования (ВСОКО)", required: true },
      { type: "elearning_rules", label: "Положение о порядке применения электронного обучения и дистанционных образовательных технологий", required: false },
      { type: "practice_rules", label: "Положение о практике (стажировке) обучающихся", required: false },
    ],
  },
  {
    id: "qualification_docs",
    title: "Документы о квалификации",
    shortTitle: "Квалификация",
    icon: "Award",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    documents: [
      { type: "qualification_issuance", label: "Положение о порядке оформления, выдачи и учета документов о квалификации", required: true },
      { type: "credit_rules", label: "Положение о порядке зачета результатов обучения", required: true },
    ],
  },
  {
    id: "additional_lna",
    title: "Дополнительные ЛНА",
    shortTitle: "Доп. ЛНА",
    icon: "ClipboardList",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    documents: [
      { type: "salary_rules", label: "Положение об оплате труда работников", required: true },
      { type: "pedagogical_council", label: "Положение о педагогическом совете", required: true },
      { type: "paid_services", label: "Положение о порядке оказания платных образовательных услуг", required: false },
      { type: "personal_data", label: "Положение о защите персональных данных", required: true },
      { type: "electronic_docs_rules", label: "Положение о порядке ведения электронной документации и приравнивании электронных документов к документам на бумажном носителе", required: false },
    ],
  },
  {
    id: "orders",
    title: "Основные приказы",
    shortTitle: "Приказы (осн.)",
    icon: "FileCheck",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    documents: [
      { type: "program_approval", label: "Приказы об утверждении образовательных программ", required: true },
      { type: "schedule_approval", label: "Приказ об утверждении календарного учебного графика", required: true },
      { type: "commission_orders", label: "Приказы о создании комиссий", required: true },
      { type: "doc_forms_approval", label: "Приказ об утверждении форм документов об образовании", required: true },
      { type: "electronic_docs_order", label: "Приказ об утверждении Положения о порядке ведения электронной документации и приравнивании электронных документов к документам на бумажном носителе", required: false },
    ],
  },
  {
    id: "annual_reports",
    title: "Отчёты",
    shortTitle: "Отчёты",
    icon: "FileText",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    documents: [
      { type: "self_examination_report", label: "Отчёт о результатах самообследования", required: true, annual: true },
    ],
  },
];

export const SPECIAL_CATEGORIES = [
  {
    id: "enrollment_orders",
    title: "Приказы о зачислении / отчислении",
    shortTitle: "Приказы зач./отч.",
    icon: "Users",
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    documents: [
      { type: "enrollment_order", label: "Приказ о зачислении", required: false },
      { type: "expulsion_order", label: "Приказ об отчислении", required: false },
    ],
  },
  {
    id: "attestation_protocols",
    title: "Протоколы аттестационной комиссии",
    shortTitle: "Протоколы АК",
    icon: "ClipboardList",
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    documents: [
      { type: "attestation_protocol", label: "Протокол аттестационной комиссии", required: false },
    ],
  },
  {
    id: "certificates",
    title: "Удостоверения",
    shortTitle: "Удостоверения",
    icon: "Award",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    documents: [
      { type: "certificate_qualification", label: "Удостоверение о повышении квалификации", required: false },
    ],
  },
  {
    id: "diplomas",
    title: "Дипломы",
    shortTitle: "Дипломы",
    icon: "GraduationCap",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    documents: [
      { type: "diploma_retraining", label: "Диплом о профессиональной переподготовке", required: false },
    ],
  },
  {
    id: "testimonials",
    title: "Свидетельства",
    shortTitle: "Свидетельства",
    icon: "FileCheck",
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    documents: [
      { type: "testimonial_profession", label: "Свидетельство о профессии рабочего", required: false },
      { type: "testimonial_position", label: "Свидетельство о должности служащего", required: false },
    ],
  },
];

export const ALL_CATEGORIES = [...REGULAR_CATEGORIES, ...SPECIAL_CATEGORIES];

export const getAllDocumentTypes = () => {
  const types: { value: string; label: string; categoryId: string }[] = [];
  ALL_CATEGORIES.forEach((cat) => {
    cat.documents.forEach((doc) => {
      types.push({ value: doc.type, label: doc.label, categoryId: cat.id });
    });
  });
  return types;
};

export function useOrgDocumentsManager(organizationId: string, canWrite = false) {
  const uploadOperation = useRef<{ key: string; operation: DocumentUploadOperation } | null>(null);
  const saving = useRef(false);
  const activeOrganization = useRef(organizationId);
  activeOrganization.current = organizationId;
  const fetchSequence = useRef(0);
  const [versionsDocument, setVersionsDocument] = useState<OrgDocument | null>(null);
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [uploadDocType, setUploadDocType] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadIssueDate, setUploadIssueDate] = useState<string>("");
  const [uploadExpiresAt, setUploadExpiresAt] = useState<string>("");
  const [uploadResponsible, setUploadResponsible] = useState<string>("");
  const [expiryFilter, setExpiryFilter] = useState<"all" | "active" | "expiring" | "expired" | "archived">("all");
  const [showQuiz, setShowQuiz] = useState(false);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);
  const [showAutoGenSuccessDialog, setShowAutoGenSuccessDialog] = useState(false);
  const [organizationData, setOrganizationData] = useState<any>(null);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [selectedDocsForOrder, setSelectedDocsForOrder] = useState<string[]>([]);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  useEffect(() => {
    setDocuments([]); setVersionsDocument(null); uploadOperation.current = null;
    fetchDocuments();
    fetchOrganizationData();
    return () => { ++fetchSequence.current; };
  }, [organizationId]);

  const fetchOrganizationData = async () => {
    try {
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", organizationId)
        .single();
      if (!error && data && activeOrganization.current === organizationId) setOrganizationData(data);
    } catch (error) {
      console.error("Error fetching organization:", error);
    }
  };

  const fetchDocuments = async () => {
    if (activeOrganization.current !== organizationId) return;
    const run = ++fetchSequence.current;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("org_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (run === fetchSequence.current && activeOrganization.current === organizationId) setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Ошибка загрузки документов");
    } finally {
      if (run === fetchSequence.current && activeOrganization.current === organizationId) setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadDocType) {
      toast.error("Выберите файл");
      return;
    }
    const docTypeInfo = getAllDocumentTypes().find((t) => t.value === uploadDocType);
    if (!docTypeInfo) return;

    if (!canWrite || saving.current) return;
    saving.current = true;
    setIsUploading(true);
    try {
      const existingDoc = getDocumentForType(uploadDocType);
      const metadata = { name: docTypeInfo.label, type: uploadDocType, status: "active",
        issue_date: uploadIssueDate || null, expires_at: uploadExpiresAt || null, responsible_person: uploadResponsible || null };
      const key = JSON.stringify({ organizationId, id: existingDoc?.id, revision: existingDoc?.document_revision ?? 0, metadata });
      if (uploadOperation.current?.key !== key || uploadOperation.current.operation.file !== selectedFile) {
        uploadOperation.current = { key, operation: createDocumentUploadOperation({ organizationId,
          documentId: existingDoc?.id, expectedRevision: existingDoc?.document_revision ?? 0,
          file: selectedFile, document: metadata }) };
      }
      await saveDocumentUpload(uploadOperation.current.operation);
      uploadOperation.current = null;
      toast.success(existingDoc ? "Документ обновлён. Предыдущий файл сохранён в истории." : "Документ загружен");
      setShowUploadDialog(false);
      setUploadDocType("");
      setSelectedFile(null);
      setUploadIssueDate("");
      setUploadExpiresAt("");
      setUploadResponsible("");
      fetchDocuments();
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Не удалось сохранить документ", { description: getErrorMessage(error) });
      if ((error as any)?.code === "40001") { uploadOperation.current = null; await fetchDocuments(); }
    } finally {
      saving.current = false;
      setIsUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!canWrite) return;
    if (!confirm("Переместить документ в корзину? Он будет храниться 30 дней и может быть восстановлен.")) return;
    try {
      const { data, error } = await supabase.rpc("soft_delete_document", {
        p_table: "org_documents",
        p_id: docId,
      });
      if (error) throw error;
      if (!data) throw new Error("Документ не найден или уже удалён");
      setDocuments(documents.filter((d) => d.id !== docId));
      toast.success("Документ перемещён в корзину");
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления", { description: getErrorMessage(error) });
    }
  };

  const openUploadDialog = (docType: string) => {
    if (!canWrite) return;
    uploadOperation.current = null;
    setUploadDocType(docType);
    setSelectedFile(null);
    const existing = documents.find((d) => d.type === docType);
    setUploadIssueDate(existing?.issue_date || "");
    setUploadExpiresAt(existing?.expires_at || "");
    setUploadResponsible(existing?.responsible_person || "");
    setShowUploadDialog(true);
  };

  const archiveDocument = async (docId: string) => {
    if (!canWrite) return;
    const { error } = await supabase
      .from("org_documents")
      .update({ status: "archived" })
      .eq("id", docId).eq("organization_id", organizationId).is("deleted_at", null).select("id").single();
    if (error) {
      toast.error("Не удалось архивировать");
      return;
    }
    toast.success("Документ перенесён в архив");
    fetchDocuments();
  };

  const restoreDocument = async (docId: string) => {
    if (!canWrite) return;
    const { error } = await supabase
      .from("org_documents")
      .update({ status: "active" })
      .eq("id", docId).eq("organization_id", organizationId).is("deleted_at", null).select("id").single();
    if (error) {
      toast.error("Не удалось восстановить");
      return;
    }
    toast.success("Документ восстановлен");
    fetchDocuments();
  };

  const getExpiryStatus = getOrgDocumentState;

  const handleQuizSubmit = async (quizData: any) => {
    if (!canWrite) return;
    setIsSubmittingQuiz(true);
    try {
      const { error } = await supabase.from("service_orders").insert({
        organization_id: organizationId,
        service_id: "self_examination_report_auto",
        service_title: "Автоформирование отчёта о результатах самообследования",
        service_price: "1 000 ₽",
        notes: JSON.stringify(quizData),
        status: "pending",
      });
      if (error) throw error;
      setShowQuiz(false);
      setShowAutoGenSuccessDialog(true);
      toast.success("Заявка на автоформирование отправлена!");
    } catch (error) {
      console.error("Error submitting auto-gen order:", error);
      toast.error("Ошибка при отправке заявки");
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  const handleOrderDocuments = async () => {
    if (!canWrite) return;
    if (selectedDocsForOrder.length === 0) {
      toast.error("Выберите хотя бы один документ");
      return;
    }
    setIsSubmittingOrder(true);
    try {
      const allDocs = getAllDocumentTypes();
      const selectedDocLabels = selectedDocsForOrder.map((type) => allDocs.find((d) => d.value === type)?.label || type);
      const { error } = await supabase.from("service_orders").insert({
        organization_id: organizationId,
        service_id: "document_order",
        service_title: "Заказ документов",
        service_price: "По запросу",
        notes: JSON.stringify({ documents: selectedDocsForOrder, documentLabels: selectedDocLabels, count: selectedDocsForOrder.length }),
        status: "pending",
      });
      if (error) throw error;
      setShowOrderDialog(false);
      setSelectedDocsForOrder([]);
      toast.success("Заявка на изготовление документов отправлена!");
    } catch (error) {
      console.error("Error submitting document order:", error);
      toast.error("Ошибка при отправке заявки");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const toggleDocForOrder = (docType: string) => {
    setSelectedDocsForOrder((prev) => (prev.includes(docType) ? prev.filter((t) => t !== docType) : [...prev, docType]));
  };

  const getDocumentForType = (docType: string) => {
    const candidates = documents.filter(d => d.type === docType && !d.deleted_at);
    return candidates.find(d => isOrgDocumentReady(d)) ?? candidates.find(d => d.status !== "archived") ?? candidates[0];
  };
  const isDocumentReady = (docType: string) => isOrgDocumentReady(getDocumentForType(docType));

  const getDocumentsForCategory = (categoryId: string) => {
    const category = ALL_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return [];
    return documents.filter((d) => category.documents.some((cd) => cd.type === d.type));
  };

  const totalRequired = REGULAR_CATEGORIES.reduce((acc, cat) => acc + cat.documents.filter((d) => d.required).length, 0);
  const uploadedRequired = REGULAR_CATEGORIES.reduce(
    (acc, cat) => acc + cat.documents.filter((d) => d.required && isDocumentReady(d.type)).length,
    0
  );
  const completionPercent = totalRequired > 0 ? Math.round((uploadedRequired / totalRequired) * 100) : 0;

  return {
    canWrite, versionsDocument, setVersionsDocument, refreshDocuments: fetchDocuments, isDocumentReady,
    documents,
    isLoading,
    showUploadDialog,
    setShowUploadDialog,
    isUploading,
    searchQuery,
    setSearchQuery,
    activeCategory,
    setActiveCategory,
    uploadDocType,
    selectedFile,
    uploadIssueDate, setUploadIssueDate,
    uploadExpiresAt, setUploadExpiresAt,
    uploadResponsible, setUploadResponsible,
    expiryFilter, setExpiryFilter,
    showQuiz,
    setShowQuiz,
    isSubmittingQuiz,
    showAutoGenSuccessDialog,
    setShowAutoGenSuccessDialog,
    organizationData,
    showOrderDialog,
    setShowOrderDialog,
    selectedDocsForOrder,
    isSubmittingOrder,
    totalRequired,
    uploadedRequired,
    completionPercent,
    handleFileSelect,
    handleUpload,
    handleDelete,
    openUploadDialog,
    handleQuizSubmit,
    handleOrderDocuments,
    toggleDocForOrder,
    getDocumentForType,
    getDocumentsForCategory,
    archiveDocument,
    restoreDocument,
    getExpiryStatus,
  };
}
