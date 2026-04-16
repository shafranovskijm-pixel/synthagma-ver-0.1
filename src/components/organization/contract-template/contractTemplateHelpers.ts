export const CONTRACT_PLACEHOLDERS = [
  { key: "{{contract_number}}", label: "Номер договора", example: "2026-01-001", patterns: ["№", "номер договора", "договор №"] },
  { key: "{{contract_date}}", label: "Дата договора", example: "«12» января 2026 г.", patterns: ["от «", "дата"] },
  { key: "{{org_name}}", label: "Название организации", example: "ООО «Учебный центр»", patterns: ["исполнитель"] },
  { key: "{{org_director_position}}", label: "Должность руководителя", example: "Генерального директора", patterns: ["в лице"] },
  { key: "{{org_director_name}}", label: "ФИО руководителя (именительный)", example: "Иванов И.И.", patterns: ["директора", "руководителя"] },
  { key: "{{org_director_name_genitive}}", label: "ФИО руководителя (родительный)", example: "Иванова Ивана Ивановича", patterns: [] },
  { key: "{{org_director_acting}}", label: "действующего/действующей", example: "действующего", patterns: [] },
  { key: "{{org_inn}}", label: "ИНН организации", example: "7700000000", patterns: ["инн:"] },
  { key: "{{org_kpp}}", label: "КПП организации", example: "770001001", patterns: ["кпп:"] },
  { key: "{{org_ogrn}}", label: "ОГРН организации", example: "1027700000000", patterns: ["огрн:"] },
  { key: "{{org_address}}", label: "Адрес организации", example: "г. Москва, ул. Примерная, д. 1", patterns: ["адрес:"] },
  { key: "{{org_bank_name}}", label: "Название банка", example: "ПАО Сбербанк", patterns: ["банк:"] },
  { key: "{{org_bank_bik}}", label: "БИК банка", example: "044525225", patterns: ["бик:"] },
  { key: "{{org_bank_account}}", label: "Расчётный счёт", example: "40702810000000000000", patterns: ["р/с:", "расч"] },
  { key: "{{org_bank_corr_account}}", label: "Корр. счёт", example: "30101810400000000225", patterns: ["к/с:", "корр"] },
  { key: "{{company_name}}", label: "Название компании-заказчика", example: "ООО «Заказчик»", patterns: ["заказчик"] },
  { key: "{{company_director}}", label: "Руководитель компании", example: "Генерального директора Петрова П.П.", patterns: [] },
  { key: "{{company_inn}}", label: "ИНН компании", example: "7700000001", patterns: [] },
  { key: "{{company_kpp}}", label: "КПП компании", example: "770001002", patterns: [] },
  { key: "{{company_ogrn}}", label: "ОГРН компании", example: "1027700000001", patterns: [] },
  { key: "{{company_address}}", label: "Адрес компании", example: "г. Москва, ул. Заказная, д. 2", patterns: [] },
  { key: "{{individual_name}}", label: "ФИО физ. лица", example: "Сидоров Сидор Сидорович", patterns: [] },
  { key: "{{individual_passport}}", label: "Паспортные данные", example: "серия 1234 № 567890, выдан ...", patterns: [] },
  { key: "{{individual_address}}", label: "Адрес физ. лица", example: "г. Москва, ул. Примерная, д. 1, кв. 1", patterns: [] },
  { key: "{{individual_phone}}", label: "Телефон физ. лица", example: "+7 (999) 123-45-67", patterns: [] },
  { key: "{{individual_email}}", label: "E-mail физ. лица", example: "example@mail.ru", patterns: [] },
  { key: "{{course_title}}", label: "Название курса", example: "Охрана труда", patterns: ["программе", "курс"] },
  { key: "{{course_duration}}", label: "Длительность курса", example: " продолжительностью 40 часов", patterns: ["продолжительность", "часов"] },
  { key: "{{course_hours}}", label: "Кол-во часов курса", example: "40", patterns: ["часов", "объём"] },
  { key: "{{students_count}}", label: "Количество обучающихся", example: "10", patterns: ["количество", "обучающихся"] },
  { key: "{{price}}", label: "Цена за 1 человека", example: "5 000,00", patterns: ["стоимость", "цена"] },
  { key: "{{total_price}}", label: "Общая сумма", example: "50 000,00", patterns: ["общая стоимость", "итого"] },
  { key: "{{total_price_words}}", label: "Сумма прописью", example: "пятьдесят тысяч", patterns: ["прописью"] },
  { key: "{{programs_table}}", label: "Таблица программ (авто)", example: "Таблица с программами", patterns: [] },
  { key: "{{programs_list}}", label: "Список программ (текст)", example: "1. Охрана труда — 40 ч.", patterns: [] },
  { key: "{{service_start_date}}", label: "Дата начала обучения", example: "«15» января 2026 г.", patterns: [] },
  { key: "{{service_end_date}}", label: "Дата окончания обучения", example: "«15» февраля 2026 г.", patterns: [] },
  { key: "{{contract_valid_until}}", label: "Срок действия (1 год)", example: "«12» января 2027 г.", patterns: [] },
  { key: "{{additional_terms}}", label: "Дополнительные условия", example: "", patterns: [] },
  { key: "{{org_license_number}}", label: "Номер лицензии", example: "Л035-00000-00/00000000", patterns: ["лицензи"] },
  { key: "{{org_license_date}}", label: "Дата лицензии", example: "01.01.2020", patterns: ["лицензи"] },
  { key: "{{org_license_issuer}}", label: "Кем выдана лицензия", example: "Департаментом образования г. Москвы", patterns: ["выдана"] },
  { key: "{{document_type_name}}", label: "Вид документа об образовании", example: "удостоверение о повышении квалификации", patterns: ["документ об образовании", "удостоверение", "диплом"] },
  { key: "{{education_form}}", label: "Форма обучения", example: "заочная (с применением дистанционных технологий)", patterns: ["форма обучения", "очная", "заочная"] },
];

export async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    text += pageText + "\n";
  }
  return text;
}

export async function extractTextFromDOCX(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

export function getPreviewText(template: string): string {
  let preview = template;
  CONTRACT_PLACEHOLDERS.forEach((p) => {
    preview = preview.split(p.key).join(p.example || "_______________");
  });
  return preview;
}

export const FALLBACK_VARIABLE_PATTERNS = [
  { regex: /ИНН:\s*\d{10,12}/gi, replacement: "ИНН: {{org_inn}}" },
  { regex: /КПП:\s*\d{9}/gi, replacement: "КПП: {{org_kpp}}" },
  { regex: /ОГРН:\s*\d{13,15}/gi, replacement: "ОГРН: {{org_ogrn}}" },
  { regex: /БИК:\s*\d{9}/gi, replacement: "БИК: {{org_bank_bik}}" },
  { regex: /Р\/с:?\s*\d{20}/gi, replacement: "Р/с: {{org_bank_account}}" },
  { regex: /К\/с:?\s*\d{20}/gi, replacement: "К/с: {{org_bank_corr_account}}" },
  { regex: /№\s*[\d\-\/]+\s+от/gi, replacement: "№ {{contract_number}} от" },
];
