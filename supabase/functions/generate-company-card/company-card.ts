import { readStoredCompanyCardRequisites } from "../_shared/operator-details.ts";

/** Ignore all banking fields supplied by an older browser or caller. */
export function prepareCompanyCardData(companyData: Record<string, unknown>, settingValue: unknown): CompanyData {
  const current = readStoredCompanyCardRequisites(settingValue);
  const text = (key: string): string => typeof companyData[key] === "string" ? companyData[key] as string : "";
  return {
    inn: text("inn"),
    ogrnip: text("ogrnip"),
    fullName: text("fullName"),
    birthDate: text("birthDate"),
    email: text("email"),
    domain: text("domain"),
    address: text("address"),
    opf: text("opf"),
    ogrn: text("ogrn"),
    bankName: current.bankName,
    bankAccount: current.bankAccount,
    bik: current.bik,
    corrAccount: current.corrAccount,
  };
}

export interface CompanyData {
  inn: string;
  ogrnip: string;
  fullName: string;
  birthDate: string;
  email: string;
  domain: string;
  bankName: string;
  bik: string;
  bankAccount: string;
  corrAccount: string;
  address?: string;
  opf?: string;
  ogrn?: string;
}

export function generatePdfHtml(d: CompanyData): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; margin: 0; padding: 30px; background: linear-gradient(135deg, #0d2137 0%, #0a3d5c 50%, #14b8a6 100%); min-height: 100vh; }
  .card { background: white; border-radius: 20px; padding: 40px; max-width: 700px; margin: 0 auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
  .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #14b8a6; padding-bottom: 20px; }
  .header h1 { font-size: 28px; color: #0d2137; margin: 0 0 4px; }
  .header p { font-size: 12px; color: #64748b; margin: 0; letter-spacing: 2px; text-transform: uppercase; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #14b8a6; font-weight: 700; margin-bottom: 12px; }
  .field { display: flex; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
  .field-label { width: 180px; font-size: 12px; color: #94a3b8; flex-shrink: 0; }
  .field-value { font-size: 13px; font-weight: 500; color: #1e293b; }
  .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 20px; }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>Синтагма</h1>
    <p>Карточка компании · Реквизиты</p>
  </div>

  <div class="section">
    <div class="section-title">Основные реквизиты</div>
    <div class="field"><span class="field-label">Наименование</span><span class="field-value">${d.fullName}</span></div>
    <div class="field"><span class="field-label">ИНН</span><span class="field-value">${d.inn}</span></div>
    <div class="field"><span class="field-label">ОГРНИП</span><span class="field-value">${d.ogrn || d.ogrnip}</span></div>
    ${d.opf ? `<div class="field"><span class="field-label">ОПФ</span><span class="field-value">${d.opf}</span></div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Руководитель</div>
    <div class="field"><span class="field-label">ФИО</span><span class="field-value">Шафрановский Максим Михайлович</span></div>
    <div class="field"><span class="field-label">Дата рождения</span><span class="field-value">${d.birthDate}</span></div>
  </div>

  ${d.address ? `<div class="section">
    <div class="section-title">Юридический адрес</div>
    <div class="field"><span class="field-label">Адрес</span><span class="field-value">${d.address}</span></div>
  </div>` : ''}

  <div class="section">
    <div class="section-title">Контакты</div>
    <div class="field"><span class="field-label">Email</span><span class="field-value">${d.email}</span></div>
    <div class="field"><span class="field-label">Сайт</span><span class="field-value">${d.domain}</span></div>
  </div>

  <div class="section">
    <div class="section-title">Банковские реквизиты</div>
    <div class="field"><span class="field-label">Банк</span><span class="field-value">${d.bankName}</span></div>
    <div class="field"><span class="field-label">БИК</span><span class="field-value">${d.bik}</span></div>
    <div class="field"><span class="field-label">Расчётный счёт</span><span class="field-value">${d.bankAccount}</span></div>
    <div class="field"><span class="field-label">Корр. счёт</span><span class="field-value">${d.corrAccount}</span></div>
  </div>

  <div class="footer">© ${new Date().getFullYear()} sintagma.com.ru · Образовательная платформа «Синтагма»</div>
</div>
</body>
</html>`;
}
