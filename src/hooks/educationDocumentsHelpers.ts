import { parseISO, format } from "date-fns";
import { ru } from "date-fns/locale";

export interface EducationDocumentRecord {
  id: string;
  reg_number: string;
  full_name: string;
  birth_date: string;
  document_type: "certificate" | "diploma" | "qualification";
  document_series: string;
  document_number: string;
  issue_date: string;
  specialty_name: string;
  qualification_name: string;
  protocol_number: string;
  protocol_date: string;
  order_number: string;
  order_date: string;
  document_status: "original" | "duplicate";
  original_document_data: string | null;
  delivery_method: "personal" | "representative" | "postal";
  delivery_details: string | null;
  notes: string | null;
  enrollment_id?: string;
}

export interface CompletedStudent {
  enrollment_id: string;
  user_id: string;
  full_name: string;
  birth_date: string | null;
  course_title: string;
  completed_at: string;
  already_added: boolean;
  frdo_program_type: string | null;
}

export const PROGRAM_TYPE_TO_DOC_TYPE: Record<string, string> = {
  qualification_upgrade: "certificate",
  professional_retraining: "diploma",
  professional_training: "qualification",
};

export const DOCUMENT_TYPES = [
  { value: "certificate", label: "Удостоверение" },
  { value: "diploma", label: "Диплом" },
  { value: "qualification", label: "Свидетельство о квалификации" },
];

export const DELIVERY_METHODS = [
  { value: "personal", label: "Лично" },
  { value: "representative", label: "Через представителя" },
  { value: "postal", label: "Почтовое отправление" },
];

export function mapDbRecord(r: any): EducationDocumentRecord {
  return {
    id: r.id,
    reg_number: r.reg_number,
    full_name: r.full_name,
    birth_date: r.birth_date || "",
    document_type: r.document_type as "certificate" | "diploma" | "qualification",
    document_series: r.document_series || "",
    document_number: r.document_number,
    issue_date: r.issue_date,
    specialty_name: r.specialty_name,
    qualification_name: r.qualification_name || "",
    protocol_number: r.protocol_number || "",
    protocol_date: r.protocol_date || "",
    order_number: r.order_number || "",
    order_date: r.order_date || "",
    document_status: r.document_status as "original" | "duplicate",
    original_document_data: r.original_document_data,
    delivery_method: r.delivery_method as "personal" | "representative" | "postal",
    delivery_details: r.delivery_details,
    notes: r.notes,
    enrollment_id: r.enrollment_id || undefined,
  };
}

export function getDefaultFormData(documentTypeFilter?: string) {
  return {
    reg_number: "",
    full_name: "",
    birth_date: null as Date | null,
    document_type: (documentTypeFilter || "certificate") as "certificate" | "diploma" | "qualification",
    document_series: "",
    document_number: "",
    issue_date: new Date(),
    specialty_name: "",
    qualification_name: "",
    protocol_number: "",
    protocol_date: null as Date | null,
    order_number: "",
    order_date: null as Date | null,
    document_status: "original" as "original" | "duplicate",
    original_document_data: "",
    delivery_method: "personal" as "personal" | "representative" | "postal",
    delivery_details: "",
    notes: "",
    enrollment_id: "",
  };
}

export function getJournalTitle(documentTypeFilter?: string) {
  if (documentTypeFilter === "certificate") return "Журнал регистрации удостоверений";
  if (documentTypeFilter === "diploma") return "Журнал регистрации дипломов";
  if (documentTypeFilter === "qualification") return "Журнал регистрации свидетельств";
  return "Журнал регистрации документов об образовании";
}

export function getJournalSubtitle(documentTypeFilter?: string) {
  if (documentTypeFilter === "certificate") return "Учёт выданных удостоверений о повышении квалификации";
  if (documentTypeFilter === "diploma") return "Учёт выданных дипломов о профессиональной переподготовке";
  if (documentTypeFilter === "qualification") return "Учёт выданных свидетельств о профессии/квалификации";
  return "Учёт выданных удостоверений, дипломов и свидетельств о квалификации";
}

export function buildExportData(records: EducationDocumentRecord[]) {
  return records.map((record, index) => ({
    "№ п/п": index + 1,
    "Рег. номер": record.reg_number,
    "ФИО выпускника": record.full_name,
    "Дата рождения": record.birth_date ? format(parseISO(record.birth_date), "dd.MM.yyyy", { locale: ru }) : "—",
    "Тип документа": DOCUMENT_TYPES.find((t) => t.value === record.document_type)?.label || "",
    "Серия": record.document_series || "—",
    "Номер": record.document_number,
    "Дата выдачи": format(parseISO(record.issue_date), "dd.MM.yyyy", { locale: ru }),
    "Специальность/направление": record.specialty_name,
    "Квалификация": record.qualification_name || "—",
    "№ протокола ГЭК": record.protocol_number || "—",
    "Дата протокола": record.protocol_date ? format(parseISO(record.protocol_date), "dd.MM.yyyy", { locale: ru }) : "—",
    "№ приказа об отчислении": record.order_number || "—",
    "Дата приказа": record.order_date ? format(parseISO(record.order_date), "dd.MM.yyyy", { locale: ru }) : "—",
    "Статус": record.document_status === "original" ? "Оригинал" : "Дубликат",
    "Данные оригинала (для дубликата)": record.original_document_data || "—",
    "Способ получения": DELIVERY_METHODS.find((m) => m.value === record.delivery_method)?.label || "",
    "Детали получения": record.delivery_details || "—",
    "Примечания": record.notes || "—",
  }));
}

export const EXCEL_COL_WIDTHS = [
  { wch: 8 }, { wch: 18 }, { wch: 35 }, { wch: 14 }, { wch: 25 },
  { wch: 10 }, { wch: 15 }, { wch: 14 }, { wch: 40 }, { wch: 25 },
  { wch: 15 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
  { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 30 },
];

export function buildInsertRecord(
  organizationId: string,
  student: CompletedStudent,
  regNumber: string,
  docNumber: string,
  documentTypeFilter?: string
) {
  const docType = student.frdo_program_type
    ? (PROGRAM_TYPE_TO_DOC_TYPE[student.frdo_program_type] || documentTypeFilter || "certificate")
    : (documentTypeFilter || "certificate");

  return {
    organization_id: organizationId,
    reg_number: regNumber,
    full_name: student.full_name,
    birth_date: student.birth_date || null,
    document_type: docType,
    document_series: "",
    document_number: docNumber,
    issue_date: new Date().toISOString().split("T")[0],
    specialty_name: student.course_title,
    qualification_name: "",
    protocol_number: "",
    protocol_date: null,
    order_number: "",
    order_date: null,
    document_status: "original",
    original_document_data: null,
    delivery_method: "personal",
    delivery_details: null,
    notes: null,
    enrollment_id: student.enrollment_id,
  };
}
