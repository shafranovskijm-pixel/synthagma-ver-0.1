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
    return next;
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
  return next;
}
