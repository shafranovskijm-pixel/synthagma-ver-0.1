/**
 * Билдеры HTML для печати/скачивания согласий со штампом ПЭП.
 * Используются с printHtmlContent() из src/utils/printHtmlToPdf.ts.
 */

export interface ConsentPepStamp {
  fullName: string;
  email: string;
  signedAt: string; // ISO
  ip?: string | null;
  policyVersion?: string | null;
  agreementId?: string | null; // ID записи pep_agreements
  agreementAcceptedAt?: string | null; // когда было принято Соглашение о ПЭП
  agreementVersion?: string | null;
  consentId?: string | null;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const fmtMsk = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    }) + " (МСК)";
  } catch {
    return iso;
  }
};

const baseStyles = `
  body { font-family: 'Times New Roman', Georgia, serif; color: #111; max-width: 800px; margin: 0 auto; padding: 32px; line-height: 1.55; font-size: 14px; }
  h1 { text-align: center; font-size: 18px; margin: 0 0 8px; }
  .sub { text-align: center; color: #555; font-size: 12px; margin-bottom: 24px; }
  .body-text { white-space: pre-wrap; }
  .stamp { margin-top: 36px; padding: 16px 18px; border: 2px solid #0f8f86; border-radius: 10px; background: #f1faf9; }
  .stamp h2 { margin: 0 0 6px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; color: #0f8f86; }
  .stamp .law { font-size: 11px; color: #555; margin-bottom: 10px; }
  .stamp dl { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; font-size: 12.5px; margin: 0; }
  .stamp dt { color: #555; }
  .stamp dd { margin: 0; color: #111; word-break: break-all; }
  .footer { margin-top: 24px; font-size: 11px; color: #777; text-align: center; }
`;

function stampHtml(s: ConsentPepStamp): string {
  return `
    <div class="stamp">
      <h2>Документ подписан простой электронной подписью</h2>
      <div class="law">в соответствии с Федеральным законом от 06.04.2011 № 63-ФЗ «Об электронной подписи»</div>
      <dl>
        <dt>ФИО подписанта:</dt><dd>${esc(s.fullName)}</dd>
        <dt>E-mail (ключ ПЭП):</dt><dd>${esc(s.email)}</dd>
        <dt>Дата и время:</dt><dd>${fmtMsk(s.signedAt)}</dd>
        ${s.ip ? `<dt>IP-адрес:</dt><dd>${esc(s.ip)}</dd>` : ""}
        ${s.policyVersion ? `<dt>Версия документа:</dt><dd>${esc(s.policyVersion)}</dd>` : ""}
        ${s.consentId ? `<dt>ID документа:</dt><dd>${esc(s.consentId)}</dd>` : ""}
        ${s.agreementId ? `<dt>Соглашение о ПЭП:</dt><dd>PEP-${esc(s.agreementId.slice(0, 8).toUpperCase())}${s.agreementAcceptedAt ? ` от ${fmtMsk(s.agreementAcceptedAt)}` : ""}${s.agreementVersion ? ` (${esc(s.agreementVersion)})` : ""}</dd>` : ""}
      </dl>
    </div>
  `;
}

export interface ConsentPdfParams {
  title: string;
  bodyText: string;
  organizationLine?: string;
  stamp: ConsentPepStamp;
}

export function buildConsentPdfHtml({ title, bodyText, organizationLine, stamp }: ConsentPdfParams): string {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>${baseStyles}</style></head><body>
  <h1>${esc(title)}</h1>
  ${organizationLine ? `<div class="sub">${esc(organizationLine)}</div>` : ""}
  <div class="body-text">${esc(bodyText)}</div>
  ${stampHtml(stamp)}
  <div class="footer">Сформировано платформой Sintagma · ${new Date().toLocaleString("ru-RU")}</div>
</body></html>`;
}

export function buildPepAgreementPdfHtml(params: ConsentPdfParams): string {
  // Тот же макет — отличается только заголовком/текстом, передаваемыми снаружи.
  return buildConsentPdfHtml(params);
}
