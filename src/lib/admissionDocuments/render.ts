import { exportSchema, missingFactLabels, type AdmissionDraftExport } from './contract';

const escape = (value: string) => value.replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
const dateLabel = (value: string) => value.slice(8,10)+'.'+value.slice(5,7)+'.'+value.slice(0,4);
export function renderAdmissionDraft(raw: AdmissionDraftExport): string {
  const data = exportSchema.parse(raw);
  const known = (value: string | null) => escape(value?.trim() || 'Не указано');
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Проект приказа о зачислении</title><style>body{font:14pt/1.5 "Times New Roman",serif;color:#111;padding:28px}h1{text-align:center;font-size:20pt}.draft{font:12pt Arial,sans-serif;border:2px solid #a15c00;padding:14px;background:#fff8e8}p{margin:12px 0}table{border-collapse:collapse;width:100%}td,th{border:1px solid #777;padding:8px;text-align:left}.note{font:11pt/1.5 Arial,sans-serif;color:#444}</style></head><body>'
    +'<div class="draft"><strong>ПРОЕКТ — НЕ ПОДПИСАН, НОМЕР НЕ ПРИСВОЕН</strong><p>Техническое зачисление не заменяет решение о приёме. Перед официальным оформлением уполномоченный сотрудник проверяет основания и сведения.</p></div>'
    +'<p style="text-align:center">'+known(data.organization_name)+'</p><h1>Проект приказа о зачислении</h1><p>Дата проекта приказа: '+dateLabel(data.document_date)+'.</p>'
    +'<p>Предлагается оформить зачисление с '+dateLabel(data.effective_admission_date)+':</p><table><thead><tr><th>Обучающийся</th><th>Курс</th><th>Группа</th></tr></thead><tbody><tr><td>'+known(data.student_name)+'</td><td>'+known(data.course_title)+'</td><td>'+known(data.group_name)+'</td></tr></tbody></table>'
    +'<p>Подтверждённая программа: '+known(data.program_title)+'.</p>'
    +(data.missing_facts.length?'<p>Нужно проверить: '+data.missing_facts.map(code=>escape(missingFactLabels[code])).join('; ')+'.</p>':'')
    +'<p>Основание проекта: зачисление на курс в СИНТАГМЕ. Правовое основание приёма, утверждение и регистрация проверяются отдельно.</p><p>Подпись: не проставлена.</p>'
    +'<p class="note">Сведения проекта зафиксированы системой: '+escape(data.recorded_at)+'. Дата проекта и дата начала зачисления указаны отдельно. Проект содержит сведения только об этом обучающемся.</p></body></html>';
}
