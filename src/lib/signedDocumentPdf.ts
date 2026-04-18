import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "external-contracts";

interface PartyInfo {
  fullName: string;
  email: string;
  signedAt: string | null;
  ip?: string | null;
  agreementId?: string | null;
  documentHash?: string | null;
}

interface BuildOptions {
  signatureId: string;
  documentTitle: string;
  documentHtml?: string | null;
  attachedFileUrl?: string | null;
  scanFileUrl?: string | null;
  scanIsPdf?: boolean;
  signatureMethod: "pep" | "handwritten_scan";
  sender?: PartyInfo;
  recipient?: PartyInfo;
}

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  } catch {
    return iso;
  }
};

const stampHtml = (p: PartyInfo | undefined, label: string): string => {
  if (!p?.signedAt) return "";
  return `
    <div style="border:2px solid #0f8c7e;border-radius:12px;padding:14px;background:#f0fbf9;flex:1;min-width:300px;">
      <div style="font-weight:700;font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#0f8c7e;border-bottom:1px solid rgba(15,140,126,.3);padding-bottom:6px;margin-bottom:8px;">
        ${label} · ПЭП (63-ФЗ)
      </div>
      <table style="font-size:11px;width:100%;border-collapse:collapse;color:#111;">
        <tr><td style="color:#666;width:90px;padding:2px 0;">ФИО:</td><td style="font-weight:600;">${p.fullName}</td></tr>
        <tr><td style="color:#666;padding:2px 0;">Email:</td><td>${p.email}</td></tr>
        <tr><td style="color:#666;padding:2px 0;">Дата:</td><td>${fmtDate(p.signedAt)} (МСК)</td></tr>
        ${p.ip ? `<tr><td style="color:#666;padding:2px 0;">IP:</td><td style="font-family:monospace;">${p.ip}</td></tr>` : ""}
        ${p.agreementId ? `<tr><td style="color:#666;padding:2px 0;">Соглашение:</td><td style="font-family:monospace;font-size:10px;">PEP-${p.agreementId.slice(0, 8).toUpperCase()}</td></tr>` : ""}
        ${p.documentHash ? `<tr><td style="color:#666;padding:2px 0;vertical-align:top;">SHA-256:</td><td style="font-family:monospace;font-size:9px;word-break:break-all;">${p.documentHash}</td></tr>` : ""}
      </table>
    </div>`;
};

/**
 * Собирает финальный подписанный PDF: контент документа + штампы обеих сторон.
 * Кладёт результат в external-contracts/signed/{id}.pdf и возвращает path.
 */
export async function generateSignedPdf(opts: BuildOptions): Promise<{ path: string; url: string }> {
  const {
    signatureId,
    documentTitle,
    documentHtml,
    attachedFileUrl,
    scanFileUrl,
    scanIsPdf,
    signatureMethod,
    sender,
    recipient,
  } = opts;

  // Создаём оффскрин-контейнер для рендера
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "794px"; // A4 @ 96dpi
  container.style.padding = "32px";
  container.style.background = "#ffffff";
  container.style.color = "#111";
  container.style.fontFamily = "'Times New Roman', serif";
  container.style.fontSize = "13px";
  container.style.lineHeight = "1.5";

  const methodLabel = signatureMethod === "handwritten_scan"
    ? "Способ подписания: скан с собственноручной подписью и печатью"
    : "Способ подписания: ПЭП (Простая электронная подпись, 63-ФЗ)";

  let bodyHtml = "";
  if (documentHtml) {
    bodyHtml = `<div style="margin:16px 0;">${documentHtml}</div>`;
  } else if (attachedFileUrl) {
    bodyHtml = `<div style="padding:24px;border:1px dashed #999;border-radius:10px;text-align:center;margin:16px 0;">
      <p><strong>Документ-вложение:</strong> ${documentTitle}</p>
      <p style="font-size:11px;color:#666;">Оригинальный файл доступен по ссылке во вложении.</p>
    </div>`;
  }

  let scanHtml = "";
  if (scanFileUrl && !scanIsPdf) {
    scanHtml = `<div style="margin-top:20px;border-top:1px solid #ddd;padding-top:16px;">
      <h3 style="margin:0 0 8px 0;color:#0f8c7e;font-size:14px;">Скан с собственноручной подписью и печатью</h3>
      <img src="${scanFileUrl}" crossorigin="anonymous" style="max-width:100%;border:1px solid #ddd;border-radius:6px;" />
    </div>`;
  }

  container.innerHTML = `
    <div style="border-bottom:3px solid #0f8c7e;padding-bottom:12px;margin-bottom:16px;">
      <h1 style="margin:0 0 6px 0;color:#0f8c7e;font-size:20px;">${documentTitle}</h1>
      <div style="font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.05em;">
        ${methodLabel}
      </div>
    </div>
    ${bodyHtml}
    ${scanHtml}
    <div style="margin-top:28px;border-top:2px dashed #0f8c7e;padding-top:18px;">
      <h3 style="margin:0 0 12px 0;color:#0f8c7e;font-size:13px;text-transform:uppercase;letter-spacing:.05em;">
        Подписи сторон
      </h3>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${stampHtml(sender, "Отправитель (Оператор)")}
        ${stampHtml(recipient, "Получатель")}
      </div>
    </div>
    <div style="margin-top:18px;font-size:9px;color:#888;text-align:center;border-top:1px solid #eee;padding-top:8px;">
      Документ подписан в системе Синтагма · Подписи имеют юридическую силу, равную собственноручной (ст. 6 63-ФЗ)
    </div>
  `;

  document.body.appendChild(container);

  try {
    // Ждём загрузки изображений (если есть)
    const imgs = Array.from(container.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) return resolve();
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
      )
    );

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;
    const imgData = canvas.toDataURL("image/png");

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const blob = pdf.output("blob");
    const path = `signed/${signatureId}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Запоминаем путь в БД (мягко — без проверки ошибок)
    await supabase
      .from("document_signatures")
      .update({ signed_document_path: path })
      .eq("id", signatureId);

    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);

    return { path, url: signed?.signedUrl || "" };
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Получает кешированный подписанный PDF, если он есть.
 */
export async function getCachedSignedPdfUrl(signedDocumentPath: string | null | undefined): Promise<string | null> {
  if (!signedDocumentPath) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(signedDocumentPath, 60 * 60);
  if (error) return null;
  return data?.signedUrl || null;
}
