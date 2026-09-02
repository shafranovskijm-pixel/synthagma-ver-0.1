import type { CounterpartySubTab, DocumentSubTab } from "@/hooks/useDocumentsTab";

const DOCUMENT_VIEWS: ReadonlySet<DocumentSubTab> = new Set([
  "kpi",
  "constructor",
  "programs",
  "org",
  "orders",
  "protocols",
  "certificates",
  "diplomas",
  "testimonials",
  "journals",
  "frdo",
  "counterparties",
  "incoming",
  "signatures",
  "pd_requests",
  "recycle_bin",
]);

const COUNTERPARTY_VIEWS: ReadonlySet<CounterpartySubTab> = new Set([
  "contracts",
  "invoices",
  "closing",
  "history",
]);

const EDUCATION_DOCUMENT_JOURNAL = "education_documents";
const EDUCATION_DOCUMENT_FOCUS_PARAMS = [
  "journal",
  "educationRecordId",
  "educationEnrollmentId",
] as const;

export interface EducationDocumentsJournalFocus {
  enrollmentId: string;
  recordId: string | null;
}

export function isEducationDocumentRecordForFocus(
  record: { id: string; enrollment_id?: string | null },
  focus: EducationDocumentsJournalFocus,
): boolean {
  return Boolean(focus.recordId)
    && record.id === focus.recordId
    && record.enrollment_id === focus.enrollmentId;
}

export function clearEducationDocumentsJournalFocusParams(
  params: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(params);
  EDUCATION_DOCUMENT_FOCUS_PARAMS.forEach((key) => next.delete(key));
  return next;
}

export function readEducationDocumentsJournalFocus(
  params: URLSearchParams,
): EducationDocumentsJournalFocus | null {
  if (params.get("journal") !== EDUCATION_DOCUMENT_JOURNAL) return null;
  const enrollmentId = params.get("educationEnrollmentId")?.trim();
  if (!enrollmentId) return null;
  return {
    enrollmentId,
    recordId: params.get("educationRecordId")?.trim() || null,
  };
}

export function educationDocumentsJournalPath(input: {
  enrollmentId: string;
  recordId?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("tab", "documents");
  params.set("documentView", "journals");
  params.set("journal", EDUCATION_DOCUMENT_JOURNAL);
  params.set("educationEnrollmentId", input.enrollmentId);
  if (input.recordId) params.set("educationRecordId", input.recordId);
  return `/organization?${params.toString()}`;
}

export function readDocumentView(params: URLSearchParams): DocumentSubTab | null {
  const value = params.get("documentView") as DocumentSubTab | null;
  return value && DOCUMENT_VIEWS.has(value) ? value : null;
}

export function readCounterpartyView(params: URLSearchParams): CounterpartySubTab {
  const value = params.get("counterpartyView") as CounterpartySubTab | null;
  return value && COUNTERPARTY_VIEWS.has(value) ? value : "contracts";
}

export function setDocumentViewParams(
  current: URLSearchParams,
  documentView: DocumentSubTab | null,
  counterpartyView?: CounterpartySubTab,
): URLSearchParams {
  const next = new URLSearchParams(current);
  next.set("tab", "documents");

  if (!documentView) {
    next.delete("documentView");
    next.delete("counterpartyView");
    return clearEducationDocumentsJournalFocusParams(next);
  }

  next.set("documentView", documentView);
  if (documentView === "counterparties") {
    if (counterpartyView && counterpartyView !== "contracts") {
      next.set("counterpartyView", counterpartyView);
    } else {
      next.delete("counterpartyView");
    }
  } else {
    next.delete("counterpartyView");
  }
  return documentView === "journals"
    ? next
    : clearEducationDocumentsJournalFocusParams(next);
}
