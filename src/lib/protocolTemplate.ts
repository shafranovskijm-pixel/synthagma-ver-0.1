export interface ProtocolCommissionMember {
  name: string;
  position: string;
  role: "chairman" | "member" | "secretary";
}

export interface ProtocolPreviewData {
  orgName?: string;
  courseName?: string;
  hours?: string;
  directorName?: string;
  directorPosition?: string;
  commissionMembers?: readonly ProtocolCommissionMember[];
}

export const DEFAULT_PROTOCOL_TEMPLATE = `ПРОТОКОЛ ЗАСЕДАНИЯ АТТЕСТАЦИОННОЙ КОМИССИИ

№ {{protocol_number}} от {{protocol_date}} г.

{{org_name}}

Программа обучения: {{course_name}}
Объём программы: {{course_duration}}

Состав комиссии:
{{commission_members}}

Повестка дня:
Итоговая аттестация слушателей по результатам освоения дополнительной профессиональной программы.

{{students_table}}

РЕШИЛИ:
Признать слушателей, указанных в таблице, успешно прошедшими итоговую аттестацию по дополнительной профессиональной программе «{{course_name}}».
Выдать документы о квалификации установленного образца.

Председатель комиссии: _________________ / {{chairman_name}} /
Члены комиссии: _________________ / _________________ /`;

export const PROTOCOL_PLACEHOLDERS = [
  { key: "{{protocol_number}}", label: "Номер протокола" },
  { key: "{{protocol_date}}", label: "Дата протокола" },
  { key: "{{org_name}}", label: "Название организации" },
  { key: "{{director_name}}", label: "ФИО руководителя" },
  { key: "{{director_position}}", label: "Должность руководителя" },
  { key: "{{course_name}}", label: "Название курса" },
  { key: "{{course_duration}}", label: "Объём программы (часы)" },
  { key: "{{students_table}}", label: "Таблица слушателей (авто)" },
  { key: "{{commission_members}}", label: "Состав комиссии (авто)" },
  { key: "{{chairman_name}}", label: "ФИО председателя" },
];


export const PROTOCOL_KNOWN_KEYS = PROTOCOL_PLACEHOLDERS.map(item => item.key.slice(2, -2));

/** Technical substitution checks, not approval of a form or legal content. */
export const REQUIRED_PROTOCOL_KEYS = [
  "protocol_number", "protocol_date", "org_name", "course_name",
  "students_table", "commission_members",
];

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function roleLabel(role: ProtocolCommissionMember["role"]): string {
  if (role === "chairman") return "Председатель";
  if (role === "secretary") return "Секретарь";
  return "Член комиссии";
}

/** Plain text only. The React preview escapes all substituted values. */
export function renderProtocolTemplate(template: string, data: ProtocolPreviewData = {}): string {
  const members = (data.commissionMembers ?? []).filter(member => member && typeof member === "object");
  const chairman = members.find(member => member.role === "chairman");
  const values: Record<string, string> = {
    protocol_number: "ПРИМЕР-001",
    protocol_date: "01.01.2026",
    org_name: text(data.orgName, "Учебный центр (пример)"),
    director_name: text(data.directorName, "ФИО руководителя (пример)"),
    director_position: text(data.directorPosition, "Руководитель (пример)"),
    course_name: text(data.courseName, "Учебная программа (пример)"),
    course_duration: text(data.hours, "72") + " часов",
    students_table: "№ | ФИО (пример) | Результат (пример)\n1 | Тестовый слушатель | Учебный пример результата",
    commission_members: members.map(member => `${roleLabel(member.role)}: ${text(member.name, "ФИО не указано")}${member.position ? ` — ${text(member.position, "")}` : ""}`).join("\n") || "Состав комиссии не заполнен",
    chairman_name: text(chairman?.name, "Не указан"),
  };
  // Callback substitution preserves literal dollars and never interprets HTML or
  // recursively substitutes a variable-like value typed into a name or position.
  return template.replace(/\{\{([a-zA-Z_]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match);
}
