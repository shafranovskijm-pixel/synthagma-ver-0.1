import { printHtmlContent } from "@/utils/printHtmlToPdf";

interface ProtocolData {
  documentTitle: string;
  documentType: string;
  documentHash: string | null;
  organizationName?: string;
  organizationInn?: string | null;
  senderName?: string | null;
  recipientName: string;
  recipientEmail: string;
  recipientType: string;
  status: string;
  createdAt: string;
  sentAt?: string | null;
  signedAt?: string | null;
  signedIp?: string | null;
  signedUserAgent?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  expiresAt: string;
  signatureToken: string;
}

const TYPE_LABELS: Record<string, string> = {
  contract: "Договор",
  consent: "Согласие на обработку персональных данных",
  act: "Акт",
  order: "Приказ",
  custom_pdf: "Документ",
  education_document: "Документ об образовании",
  pep_agreement: "Соглашение о ПЭП",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлено получателю",
  viewed: "Просмотрено получателем",
  signed: "Подписано простой электронной подписью",
  rejected: "Отклонено получателем",
  expired: "Срок действия истёк",
};

function fmt(s: string | null | undefined) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "medium" });
  } catch { return s; }
}

export function buildProtocolHtml(d: ProtocolData): string {
  const protocolNumber = `ПЭП-${d.signatureToken.slice(0, 8).toUpperCase()}`;
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><title>Протокол подписания ${protocolNumber}</title>
<style>
  body { font-family: 'Times New Roman', Georgia, serif; color: #111; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
  h1 { text-align: center; font-size: 20px; margin-bottom: 4px; }
  .sub { text-align: center; color: #555; margin-bottom: 24px; font-size: 13px; }
  .section { margin: 18px 0; }
  .section-title { font-weight: bold; font-size: 14px; text-transform: uppercase; border-bottom: 2px solid #14b8a6; padding-bottom: 4px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 6px 10px; border-bottom: 1px solid #eee; vertical-align: top; }
  td:first-child { color: #555; width: 220px; }
  .hash { font-family: 'Courier New', monospace; font-size: 11px; word-break: break-all; }
  .stamp { margin-top: 28px; border: 2px solid #059669; border-radius: 10px; padding: 16px; background: #ecfdf5; }
  .stamp-title { font-weight: bold; color: #047857; font-size: 14px; margin-bottom: 8px; }
  .footer { margin-top: 32px; font-size: 11px; color: #666; text-align: center; border-top: 1px solid #ddd; padding-top: 12px; }
</style></head><body>

<h1>ПРОТОКОЛ ПОДПИСАНИЯ ДОКУМЕНТА</h1>
<div class="sub">Простая электронная подпись (ст. 5, 6, 9 Федерального закона № 63-ФЗ «Об электронной подписи»)</div>
<div class="sub">№ ${protocolNumber} от ${fmt(d.createdAt)}</div>

<div class="section">
  <div class="section-title">1. Сведения о документе</div>
  <table>
    <tr><td>Наименование:</td><td><strong>${d.documentTitle}</strong></td></tr>
    <tr><td>Тип документа:</td><td>${TYPE_LABELS[d.documentType] || d.documentType}</td></tr>
    <tr><td>Хеш документа (SHA-256):</td><td class="hash">${d.documentHash || "—"}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">2. Сведения об отправителе</div>
  <table>
    <tr><td>Организация:</td><td>${d.organizationName || "—"}${d.organizationInn ? ` (ИНН ${d.organizationInn})` : ""}</td></tr>
    <tr><td>Отправил:</td><td>${d.senderName || "—"}</td></tr>
    <tr><td>Дата отправки:</td><td>${fmt(d.sentAt)}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">3. Сведения о получателе (подписанте)</div>
  <table>
    <tr><td>ФИО / Наименование:</td><td><strong>${d.recipientName}</strong></td></tr>
    <tr><td>Email:</td><td>${d.recipientEmail}</td></tr>
    <tr><td>Тип получателя:</td><td>${d.recipientType === "student" ? "Физическое лицо (ученик)" : d.recipientType === "company" ? "Юридическое лицо (компания)" : "Физическое лицо"}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">4. Статус подписания</div>
  <table>
    <tr><td>Текущий статус:</td><td><strong>${STATUS_LABELS[d.status] || d.status}</strong></td></tr>
    <tr><td>Срок действия ссылки:</td><td>${fmt(d.expiresAt)}</td></tr>
    ${d.rejectedAt ? `<tr><td>Отклонено:</td><td>${fmt(d.rejectedAt)}</td></tr>` : ""}
    ${d.rejectionReason ? `<tr><td>Причина отклонения:</td><td>${d.rejectionReason}</td></tr>` : ""}
  </table>
</div>

${d.status === "signed" ? `
<div class="stamp">
  <div class="stamp-title">✓ ДОКАЗАТЕЛЬСТВА ПОДПИСАНИЯ ПРОСТОЙ ЭЛЕКТРОННОЙ ПОДПИСЬЮ</div>
  <table>
    <tr><td>Подписано:</td><td><strong>${fmt(d.signedAt)}</strong> (МСК)</td></tr>
    <tr><td>IP-адрес подписанта:</td><td class="hash">${d.signedIp || "—"}</td></tr>
    <tr><td>User-Agent (браузер/устройство):</td><td class="hash">${d.signedUserAgent || "—"}</td></tr>
    <tr><td>Ключ ЭП подписанта:</td><td>Email: <strong>${d.recipientEmail}</strong> + пароль учётной записи</td></tr>
    <tr><td>Хеш подписанного документа:</td><td class="hash">${d.documentHash || "—"}</td></tr>
  </table>
  <p style="margin-top:12px;font-size:12px;">
    Настоящим подтверждается, что документ <strong>«${d.documentTitle}»</strong> был подписан получателем
    <strong>${d.recipientName}</strong> простой электронной подписью в соответствии с
    Федеральным законом № 63-ФЗ «Об электронной подписи». Подписант подтвердил свою личность
    путём ввода пары «email + пароль», подтверждения OTP-кода (для гостей) и принятия
    Соглашения о применении простой электронной подписи. Электронный документ имеет равную
    юридическую силу с документом на бумажном носителе, подписанным собственноручной подписью.
  </p>
</div>
` : ""}

<div class="footer">
  Протокол сформирован автоматически системой электронного документооборота.<br/>
  Идентификатор подписания: <span class="hash">${d.signatureToken}</span>
</div>

</body></html>`;
}

export function downloadSignatureProtocol(d: ProtocolData) {
  const html = buildProtocolHtml(d);
  printHtmlContent(html, `Протокол ПЭП ${d.signatureToken.slice(0, 8)}`);
}

export function exportSignaturesToCSV(rows: any[]) {
  const headers = [
    "ID", "Документ", "Тип", "Получатель", "Email", "Статус",
    "Создано", "Отправлено", "Подписано", "IP", "Хеш документа",
  ];
  const escape = (v: any) => {
    const s = v == null ? "" : String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  rows.forEach((r) => {
    lines.push([
      r.id, r.document_title, TYPE_LABELS[r.document_type] || r.document_type,
      r.recipient_name, r.recipient_email, STATUS_LABELS[r.status] || r.status,
      r.created_at, r.sent_at || "", r.signed_at || "",
      r.signed_ip || "", r.document_hash || "",
    ].map(escape).join(","));
  });
  const csv = "\uFEFF" + lines.join("\n"); // BOM для корректной кириллицы в Excel
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `signatures-journal-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
