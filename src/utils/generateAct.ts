import { supabase } from "@/integrations/supabase/client";
import { renderPlatformAct } from "@/lib/platform-act/renderPlatformAct";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import stampImg from "@/assets/stamp-shafranovskiy.png";
import signatureImg from "@/assets/signature-shafranovskiy.png";

interface ActParams {
  organizationId: string;
  orgName: string;
  orgInn: string | null;
  directorName: string | null;
  directorPosition: string | null;
  actDate: Date;
  basis: string;
  amount: number;
  /** Optional: id счёта из subscription_invoices, если акт формируется по конкретному счёту */
  sourceInvoiceId?: string | null;
}

/** Маркер связи "акт ↔ счёт", встраивается невидимо в docName */
export const INVOICE_LINK_MARKER = /\u200B<inv:([0-9a-f-]{36})>\u200B/i;
export function stripInvoiceMarker(name: string): string {
  return name.replace(INVOICE_LINK_MARKER, "").trim();
}
export function extractInvoiceId(name: string): string | null {
  const m = name.match(INVOICE_LINK_MARKER);
  return m ? m[1] : null;
}

async function imageToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export interface GeneratedAct {
  html: string;
  actNumber: string;
  docName: string;
  organizationId: string;
  basis: string;
}

/**
 * Generate act HTML without saving to DB.
 * Call saveActDocument() to persist after download/print/email.
 */
export async function generateActHtml(params: ActParams): Promise<GeneratedAct | null> {
  try {
    const { organizationId, orgName, orgInn, directorName, directorPosition, actDate, basis, amount, sourceInvoiceId } = params;
    const actNumber = `A-${Date.now().toString().slice(-6)}`;
    const formattedDate = format(actDate, "dd MMMM yyyy", { locale: ru });

    const [stampBase64, signatureBase64] = await Promise.all([
      imageToBase64(stampImg),
      imageToBase64(signatureImg),
    ]);

    const html = renderPlatformAct({
      actNumber, actDate: format(actDate, "yyyy-MM-dd"), basis,
      amountKopecks: Math.round(amount * 100),
      customerName: orgName, customerInn: orgInn,
      customerDirector: directorName, customerPosition: directorPosition || "Руководитель",
      stampBase64, signatureBase64,
    });

    const baseName = `Акт № ${actNumber} от ${formattedDate} — ${basis}`;
    const docName = sourceInvoiceId ? `${baseName}\u200B<inv:${sourceInvoiceId}>\u200B` : baseName;
    return { html, actNumber, docName, organizationId, basis };
  } catch (error) {
    console.error("Error generating act HTML:", error);
    return null;
  }
}

/**
 * Save a generated act to storage and DB.
 * Call this only when the user explicitly downloads, prints, or emails the act.
 */
export async function saveActDocument(act: GeneratedAct): Promise<string | null> {
  try {
    const blob = new Blob([act.html], { type: "text/html;charset=utf-8" });
    const fileName = `${act.organizationId}/acts/act_${act.actNumber}_${Date.now()}.html`;

    const { error: uploadError } = await supabase.storage
      .from("billing-documents")
      .upload(fileName, blob, { contentType: "text/html;charset=utf-8" });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return null;
    }

    const { error: dbError } = await supabase
      .from("org_billing_documents")
      .insert({
        organization_id: act.organizationId,
        name: act.docName,
        doc_type: "act",
        file_url: fileName,
      } as any);

    if (dbError) {
      console.error("DB error:", dbError);
      return null;
    }

    return act.docName;
  } catch (error) {
    console.error("Error saving act:", error);
    return null;
  }
}

/**
 * Legacy wrapper — generates AND saves (kept for backward compatibility).
 * @deprecated Use generateActHtml() + saveActDocument() separately.
 */
export async function generateAct(params: ActParams): Promise<string | null> {
  const act = await generateActHtml(params);
  if (!act) return null;
  return saveActDocument(act);
}
