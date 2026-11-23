/** Pure individual-order layout. No grouped facts, current template, clock, IO, signatures or numbering side effects. */
export const INDIVIDUAL_ORDER_RENDERER_REVISION = 'uc-individual-order-v1' as const;
export const ORDER_PROGRAMME_LABELS = {
  professional_training: 'программа профессионального обучения',
  dpo_upskilling: 'дополнительная профессиональная программа повышения квалификации',
  dpo_retraining: 'дополнительная профессиональная программа профессиональной переподготовки',
} as const;
type ProgrammeKind = keyof typeof ORDER_PROGRAMME_LABELS;
type Source = { kind: 'org_document_version'; document_id: string; version_id: string; content_hash: string };
export interface IndividualOrderRenderVariables {
  organization_name: string; organization_inn: string | null; organization_ogrn: string | null; organization_requisites_sha256: string;
  issuer_name: string; issuer_position: string; issuer_authority_basis: { role: 'authority_document'; source: Source; review_id: string; review_revision: number; provision: string };
  student_full_name: string; programme_type: ProgrammeKind; programme_type_label: string; programme_title: string; academic_hours: number;
  order_kind: 'admission' | 'completion' | 'early_withdrawal'; official_order_number: string; document_date: string; effective_date: string;
  training_start_date: string; training_end_date: string | null; timezone: string; grounds_text: string; basis_labels: string[];
  decision_event_id: string; decision_recorded_at: string; signature_assurance: 'not_observed';
}
type Rule = (value: unknown) => boolean;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (fields: Record<string, Rule>): Rule => value => record(value) && Object.keys(value).length === Object.keys(fields).length && Object.entries(fields).every(([key, check]) => Object.prototype.hasOwnProperty.call(value, key) && check(value[key]));
const text = (max: number, empty = false): Rule => value => typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
const uuid: Rule = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const sha: Rule = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const integer = (min: number, max = Number.MAX_SAFE_INTEGER): Rule => value => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const date: Rule = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const nullable = (rule: Rule): Rule => value => value === null || rule(value);
const utc: Rule = value => typeof value === 'string' && value.length <= 64 && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/.test(value) && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const zone: Rule = value => { if (!text(100)(value)) return false; try { new Intl.DateTimeFormat('en', { timeZone: value as string }); return true; } catch { return false; } };
const source = exact({ kind: value => value === 'org_document_version', document_id: uuid, version_id: uuid, content_hash: sha });
const authority = exact({ role: value => value === 'authority_document', source, review_id: uuid, review_revision: integer(0), provision: text(2000) });
const shape = exact({
  organization_name: text(1000), organization_inn: nullable(text(20, true)), organization_ogrn: nullable(text(20, true)), organization_requisites_sha256: sha,
  issuer_name: text(500), issuer_position: text(300), issuer_authority_basis: authority, student_full_name: text(500),
  programme_type: value => typeof value === 'string' && Object.prototype.hasOwnProperty.call(ORDER_PROGRAMME_LABELS, value), programme_type_label: text(200), programme_title: text(4000), academic_hours: integer(1, 999999),
  order_kind: value => value === 'admission' || value === 'completion' || value === 'early_withdrawal', official_order_number: text(120),
  document_date: date, effective_date: date, training_start_date: date, training_end_date: nullable(date), timezone: zone,
  grounds_text: text(2000), basis_labels: value => Array.isArray(value) && value.length >= 1 && value.length <= 10 && value.every(text(2000)), decision_event_id: uuid, decision_recorded_at: utc, signature_assurance: value => value === 'not_observed',
});
export function isIndividualOrderRenderVariables(raw: unknown): raw is IndividualOrderRenderVariables {
  if (!shape(raw)) return false;
  const value = raw as IndividualOrderRenderVariables;
  return value.programme_type_label === ORDER_PROGRAMME_LABELS[value.programme_type] && (value.training_end_date === null || value.training_end_date >= value.training_start_date);
}
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const displayDate = (value: string) => value.slice(8, 10) + '.' + value.slice(5, 7) + '.' + value.slice(0, 4);
const headings = {
  admission: 'О зачислении на обучение',
  completion: 'Об отчислении в связи с завершением обучения',
  early_withdrawal: 'О досрочном прекращении образовательных отношений',
} as const;
export function renderIndividualEducationOrder(raw: unknown): string {
  if (!isIndividualOrderRenderVariables(raw)) throw new Error('INDIVIDUAL_ORDER_RENDER_INPUT_INVALID');
  const value = raw, title = headings[value.order_kind], student = escape(value.student_full_name);
  const action = value.order_kind === 'admission' ? `Зачислить ${student} на обучение с ${displayDate(value.effective_date)}.`
    : value.order_kind === 'completion' ? `Отчислить ${student} в связи с завершением обучения с ${displayDate(value.effective_date)}.`
      : `Прекратить образовательные отношения и отчислить ${student} с ${displayDate(value.effective_date)} по указанному ниже основанию.`;
  const period = displayDate(value.training_start_date) + (value.training_end_date === null ? ' — дата окончания отдельно не установлена' : ' — ' + displayDate(value.training_end_date));
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escape(title) + '</title>'
    + '<style>@page{size:A4 portrait;margin:20mm 18mm}*{box-sizing:border-box}body{font:12pt/1.35 "UC019 PTSans",Arial,sans-serif;color:#111;margin:0}h1{font-size:16pt;text-align:center;margin:18pt 0 8pt}h2{font-size:12pt;text-align:center;margin:6pt 0 18pt}p{margin:7pt 0}.header{text-align:center}.meta{font-size:10pt;color:#333}.signature{margin-top:28pt}table{border-collapse:collapse;width:100%;margin:12pt 0}th,td{border:1px solid #555;padding:7pt;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{font-weight:bold;background:#f3f3f3}ul{padding-left:20pt}li{margin:5pt 0}.note{font-size:9pt;margin-top:24pt;color:#444;overflow-wrap:anywhere}</style><style data-uc-individual-order-fonts></style></head><body>'
    + '<div class="header"><p><strong>' + escape(value.organization_name) + '</strong></p>'
    + (value.organization_inn ? '<p class="meta">ИНН ' + escape(value.organization_inn) + '</p>' : '')
    + (value.organization_ogrn ? '<p class="meta">ОГРН ' + escape(value.organization_ogrn) + '</p>' : '') + '</div>'
    + '<h1>ПРИКАЗ № ' + escape(value.official_order_number) + '</h1><p class="header">от ' + displayDate(value.document_date) + '</p><h2>' + title + '</h2>'
    + '<p>На основании рассмотренных документов и решения уполномоченного лица <strong>приказываю:</strong></p><p><strong>1.</strong> ' + action + '</p>'
    + '<table><tbody><tr><th scope="row">Обучающийся</th><td>' + student + '</td></tr><tr><th scope="row">Программа</th><td>' + escape(value.programme_type_label) + ' «' + escape(value.programme_title) + '»</td></tr><tr><th scope="row">Объём</th><td>' + value.academic_hours + ' академических часов</td></tr><tr><th scope="row">Период обучения</th><td>' + period + '</td></tr></tbody></table>'
    + '<p><strong>2.</strong> Основание решения: ' + escape(value.grounds_text) + '</p><ul>' + value.basis_labels.map(label => '<li>' + escape(label) + '</li>').join('') + '</ul>'
    + '<div class="signature"><p>' + escape(value.issuer_position) + '</p><p>____________________ / ' + escape(value.issuer_name) + ' /</p><p class="meta">Полномочия: ' + escape(value.issuer_authority_basis.provision) + '</p></div>'
    + '<p class="note">Решение зафиксировано в СИНТАГМЕ: ' + escape(value.decision_recorded_at) + '. Подпись и печать этим файлом автоматически не подтверждаются. Дата приказа и дата начала действия указаны отдельно; часовой пояс: ' + escape(value.timezone) + '.</p></body></html>';
}
