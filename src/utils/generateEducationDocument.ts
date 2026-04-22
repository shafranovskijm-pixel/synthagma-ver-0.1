import type { EducationDocumentRecord } from "@/hooks/useEducationDocumentsJournal";

export interface OrgDataForDocument {
  name: string;
  license_number?: string | null;
  city?: string | null;
  stamp_url?: string | null;
  signature_url?: string | null;
  director_name?: string | null;
  director_position?: string | null;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "___________";
  const d = new Date(dateStr);
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} г.`;
}

function getDocumentTitle(type: string): string {
  switch (type) {
    case "certificate":
      return "УДОСТОВЕРЕНИЕ<br/>О ПОВЫШЕНИИ КВАЛИФИКАЦИИ";
    case "diploma":
      return "ДИПЛОМ<br/>О ПРОФЕССИОНАЛЬНОЙ ПЕРЕПОДГОТОВКЕ";
    case "qualification":
      return "СВИДЕТЕЛЬСТВО<br/>О ПРОФЕССИИ РАБОЧЕГО,<br/>ДОЛЖНОСТИ СЛУЖАЩЕГО";
    default:
      return "ДОКУМЕНТ ОБ ОБРАЗОВАНИИ";
  }
}

function getDocumentDescription(type: string): string {
  switch (type) {
    case "certificate":
      return "прошёл(а) повышение квалификации";
    case "diploma":
      return "прошёл(а) профессиональную переподготовку";
    case "qualification":
      return "прошёл(а) профессиональное обучение";
    default:
      return "прошёл(а) обучение";
  }
}

function stampSignatureHtml(org: OrgDataForDocument): string {
  const parts: string[] = [];
  if (org.stamp_url) {
    parts.push(`<img src="${org.stamp_url}" style="position:absolute;left:0;bottom:0;width:120px;height:auto;opacity:0.85;" />`);
  }
  if (org.signature_url) {
    parts.push(`<img src="${org.signature_url}" style="position:absolute;left:140px;bottom:10px;width:100px;height:auto;opacity:0.85;" />`);
  }
  return parts.join("");
}

function buildVerifyUrl(regNumber: string): string {
  const base =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://синтагма.рф";
  return `${base}/verify/${encodeURIComponent(regNumber)}`;
}

// Builds a Google Chart QR image URL — works without bundling a QR library inside
// the printed/exported HTML and renders reliably in PDF.
function qrImageUrl(text: string, size = 110): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
}

export function generateEducationDocumentHtml(
  record: EducationDocumentRecord,
  org: OrgDataForDocument,
): string {
  const title = getDocumentTitle(record.document_type);
  const description = getDocumentDescription(record.document_type);
  const issueDate = formatDate(record.issue_date);
  const protocolDate = record.protocol_date ? formatDate(record.protocol_date) : "___________";
  const directorName = org.director_name || "____________________";
  const directorPosition = org.director_position || "Руководитель";
  const orgCity = org.city || "г. Москва";
  const verifyUrl = buildVerifyUrl(record.reg_number);

  const qualificationBlock =
    record.document_type !== "certificate" && record.qualification_name
      ? `<tr><td style="padding:6px 0;color:#555;">Присвоена квалификация:</td><td style="padding:6px 0;font-weight:bold;">${record.qualification_name}</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8"/>
<title>${record.document_type === "certificate" ? "Удостоверение" : record.document_type === "diploma" ? "Диплом" : "Свидетельство"} ${record.document_number}</title>
<style>
  @page { size: A4 portrait; margin: 20mm 25mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 14px;
    line-height: 1.6;
    color: #222;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .document {
    max-width: 700px;
    margin: 0 auto;
    padding: 40px 20px;
  }
  .header {
    text-align: center;
    margin-bottom: 30px;
  }
  .org-name {
    font-size: 13px;
    color: #555;
    margin-bottom: 6px;
  }
  .license {
    font-size: 11px;
    color: #888;
    margin-bottom: 20px;
  }
  .doc-title {
    font-size: 20px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 8px;
    line-height: 1.4;
  }
  .doc-number {
    font-size: 14px;
    color: #555;
    margin-bottom: 30px;
  }
  .series-number {
    display: flex;
    justify-content: center;
    gap: 30px;
    font-size: 13px;
    color: #666;
    margin-bottom: 5px;
  }
  .body-text {
    text-align: left;
    margin-bottom: 30px;
  }
  .body-text p {
    margin-bottom: 10px;
    text-indent: 30px;
  }
  .name-highlight {
    font-size: 18px;
    font-weight: bold;
    text-align: center;
    padding: 8px 0;
    border-bottom: 1px solid #ccc;
    margin: 10px 0;
  }
  .details-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
  }
  .details-table td {
    padding: 5px 0;
    vertical-align: top;
    font-size: 13px;
  }
  .details-table td:first-child {
    width: 45%;
    color: #555;
  }
  .footer {
    margin-top: 50px;
    position: relative;
  }
  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 40px;
  }
  .signature-block {
    position: relative;
    min-height: 60px;
  }
  .signature-line {
    border-bottom: 1px solid #999;
    width: 200px;
    margin-top: 30px;
  }
  .signature-label {
    font-size: 11px;
    color: #888;
    margin-top: 3px;
  }
  .stamp-area {
    text-align: center;
    font-size: 11px;
    color: #aaa;
  }
  .reg-line {
    font-size: 12px;
    color: #666;
    margin-top: 10px;
  }
</style>
</head>
<body>
<div class="document">
  <div class="header">
    <div class="org-name">${org.name || "Образовательная организация"}</div>
    ${org.license_number ? `<div class="license">Лицензия: ${org.license_number}</div>` : ""}
    <div class="doc-title">${title}</div>
    ${record.document_series || record.document_number ? `
    <div class="series-number">
      ${record.document_series ? `<span>Серия: <strong>${record.document_series}</strong></span>` : ""}
      <span>№ <strong>${record.document_number}</strong></span>
    </div>` : ""}
    <div class="doc-number">Регистрационный номер: ${record.reg_number}</div>
  </div>

  <div class="body-text">
    <div class="name-highlight">${record.full_name}</div>
    ${record.birth_date ? `<p style="text-align:center;font-size:12px;color:#888;margin-top:2px;">Дата рождения: ${formatDate(record.birth_date)}</p>` : ""}

    <p style="margin-top:20px;">${description} в ${org.name || "образовательной организации"}</p>

    <table class="details-table">
      <tr>
        <td>Программа обучения:</td>
        <td><strong>${record.specialty_name}</strong></td>
      </tr>
      ${qualificationBlock}
      ${record.protocol_number ? `<tr><td>Протокол аттестационной комиссии:</td><td>№ ${record.protocol_number} от ${protocolDate}</td></tr>` : ""}
      ${record.order_number ? `<tr><td>Приказ:</td><td>№ ${record.order_number}${record.order_date ? ` от ${formatDate(record.order_date)}` : ""}</td></tr>` : ""}
    </table>
  </div>

  <div class="footer">
    <div style="text-align:left;font-size:13px;">
      <p>${orgCity}, ${issueDate}</p>
    </div>
    <div class="footer-row">
      <div class="signature-block">
        ${stampSignatureHtml(org)}
        <div>${directorPosition}</div>
        <div class="signature-line"></div>
        <div class="signature-label">${directorName}</div>
      </div>
      <div class="stamp-area">
        <img src="${qrImageUrl(verifyUrl)}" style="width:90px;height:90px;display:block;margin:0 auto 4px;" alt="QR" />
        <div style="font-size:10px;color:#666;">Проверить подлинность</div>
        <div style="font-size:9px;color:#999;">синтагма.рф/verify</div>
      </div>
    </div>
    <div class="reg-line">
      Регистрационный номер: ${record.reg_number} · Проверить: ${verifyUrl}
    </div>
  </div>
</div>
</body>
</html>`;
}
