/**
 * HTML-шаблоны документов группы.
 * Договор — дословно из шаблона ООО «ИЦ «ГОРЭЛТЕХ».
 * Остальные — по структуре документов архива группы 1-ПК-26.
 */
import type { DocType } from "./schema";
import { CONTRACT_BODY_HTML } from "./contractBody";

export interface DocTemplate {
  doc_type: DocType;
  title: string;
  hint: string;
  body_html: string;
  requiredKeys: string[];
}

const CSS = `
@page{size:A4;margin:15mm}
body{font-family:'Times New Roman',Times,serif;font-size:12px;line-height:1.35;color:#000;max-width:180mm;margin:0 auto;padding:8px}
h1{text-align:center;font-size:14px;font-weight:bold;margin:8px 0;text-transform:uppercase}
h2{text-align:center;font-size:13px;font-weight:bold;margin:12px 0 6px}
.right{text-align:right}.center{text-align:center}.justify{text-align:justify}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:11px}
th,td{border:1px solid #000;padding:3px 5px;vertical-align:top}
th{background:#f0f0f0;font-weight:bold;text-align:center}
.nb td,.nb th{border:none;padding:2px 4px}
.sig{margin-top:20px}.mt{margin-top:10px}.small{font-size:10px}
p{margin:4px 0}.indent{text-indent:1.2em}
`.replace(/\n/g, "");

const PAGE = (body: string) =>
  `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><title>Документ</title>` +
  `<style>${CSS}</style></head><body>${body}</body></html>`;

export const TEMPLATES: DocTemplate[] = [
  {
    doc_type: "contract",
    title: "Договор оказания платных образовательных услуг",
    hint: "Дословный шаблон ООО «ИЦ «ГОРЭЛТЕХ», разделы 1–12",
    requiredKeys: ["org_name", "program_title", "contract_number", "customer_name"],
    body_html: PAGE(CONTRACT_BODY_HTML),
  },
  {
    doc_type: "enrollment_order",
    title: "Приказ об открытии курса и зачислении",
    hint: "По образцу ГОРЭЛТЕХ (УЦ-N/YYYY)",
    requiredKeys: ["org_name", "group_number", "order_number", "program_title"],
    body_html: PAGE(`
<p class="right"><strong>{{org_short_name}}</strong></p>

<h1>ПРИКАЗ № {{order_number}}</h1>
<p class="center">от {{order_date}}</p>
<p class="center"><strong>Об открытии курса и зачислении на обучение</strong></p>

<p class="justify">В соответствии с ФЗ «Об образовании в Российской Федерации»,
положением об учебном центре, Уставом {{org_short_name}} <strong>приказываю:</strong></p>

<p><strong>1.</strong> Открыть курс в объёме {{program_hours}} часов по дополнительной профессиональной
образовательной программе повышения квалификации «{{program_title}}» с {{start_date_ru}}.</p>

<p><strong>2.</strong> На основании заявления о зачислении зачислить в группу следующих обучающихся:</p>

<table>
  <thead>
    <tr>
      <th>№</th>
      <th>Ф.И.О.</th>
      <th>Программа ДПО</th>
      <th>Часов</th>
      <th>Срок обучения</th>
      <th>Основание</th>
    </tr>
  </thead>
  <tbody>{{students_list_rows}}</tbody>
</table>

<p><strong>3.</strong> Присвоить группе номер <strong>{{group_number}}</strong>.</p>
<p><strong>4.</strong> Ответственность за организационно-методическое сопровождение курса
возложить на {{org_director_name}}.</p>
<p><strong>5.</strong> Контроль за исполнением настоящего приказа оставляю за собой.</p>

<div class="sig">
  <p>Руководитель учебного центра {{org_short_name}}</p>
  <p>_________________ / {{org_director_name}} /</p>
  <p class="small">{{order_date}}</p>
</div>
`),
  },

  /* ═══════════════════════ ПРИКАЗ ОБ ОТЧИСЛЕНИИ ═══════════════════════ */
  {
    doc_type: "expulsion_order",
    title: "Приказ о закрытии курса и отчислении",
    hint: "По образцу ГОРЭЛТЕХ",
    requiredKeys: ["group_number", "order_number", "end_date", "program_title"],
    body_html: PAGE(`
<p class="right"><strong>{{org_short_name}}</strong></p>

<h1>ПРИКАЗ № {{order_number}}</h1>
<p class="center">от {{order_date}}</p>
<p class="center"><strong>О закрытии курса и отчислении обучающихся</strong></p>

<p class="justify">На основании результатов итоговой аттестации <strong>приказываю:</strong></p>

<p><strong>1.</strong> Закрыть курс по программе повышения квалификации «{{program_title}}»
(объём {{program_hours}} ак. ч.) с {{end_date_ru}}.</p>

<p><strong>2.</strong> Отчислить с выдачей удостоверений о повышении квалификации
обучающихся группы <strong>{{group_number}}</strong>:</p>

<table>
  <thead>
    <tr>
      <th>№</th>
      <th>Ф.И.О.</th>
      <th>Программа ДПО</th>
      <th>Часов</th>
      <th>Срок обучения</th>
      <th>Основание</th>
    </tr>
  </thead>
  <tbody>{{students_list_rows}}</tbody>
</table>

<p><strong>3.</strong> Контроль за исполнением настоящего приказа оставляю за собой.</p>

<div class="sig">
  <p>Руководитель учебного центра {{org_short_name}}</p>
  <p>_________________ / {{org_director_name}} /</p>
  <p class="small">{{order_date}}</p>
</div>
`),
  },

  /* ═══════════════════════ СПИСОК ОБУЧАЮЩИХСЯ ═══════════════════════ */
  {
    doc_type: "student_list",
    title: "Список обучающихся",
    hint: "По образцу ГОРЭЛТЕХ: ФИО, e-mail, паспорт, образование",
    requiredKeys: ["group_number", "student_list_detail_rows"],
    body_html: PAGE(`
<p class="center"><strong>Группа обучающихся № {{group_number}}</strong></p>
<p class="center">курса «{{program_title}}»</p>

<table>
  <thead>
    <tr>
      <th style="width:36px">пп</th>
      <th>Фамилия Имя Отчество</th>
      <th>e-mail</th>
      <th>Паспорт<br/><span class="small">серия</span></th>
      <th>Паспорт<br/><span class="small">номер</span></th>
      <th>Образование</th>
    </tr>
  </thead>
  <tbody>{{student_list_detail_rows}}</tbody>
</table>

<div class="sig">
  <p>Руководитель учебного центра {{org_director_short}}</p>
  <p>_____________________________________</p>
</div>
`),
  },

  /* ═══════════════════════ ЖУРНАЛ ЗАНЯТИЙ ═══════════════════════ */
  {
    doc_type: "class_journal",
    title: "Журнал учёта занятий",
    hint: "По образцу ГОРЭЛТЕХ с датами занятий",
    requiredKeys: ["group_number", "program_title", "journal_rows"],
    body_html: PAGE(`
<p class="center"><strong>Журнал учета занятий</strong></p>
<p class="center">Группа обучающихся № <strong>{{group_number}}</strong></p>
<p class="center">Курса повышения квалификации «{{program_title}}»</p>
<p class="center">Количество учебных часов — {{program_hours}}</p>

<table>
  <thead>
    <tr>
      <th style="width:36px">пп</th>
      <th>Фамилия Имя Отчество</th>
      {{journal_head}}
    </tr>
  </thead>
  <tbody>{{journal_rows}}</tbody>
</table>

<p class="small">Режим документа: {{fill_mode}}. Источник: {{journal_source_note}}</p>
<p class="small">{{layout_notice}}</p>

<div class="sig">
  <p>Преподаватель {{org_director_short}} &nbsp;&nbsp; Подпись ______________________________</p>
  <p class="mt">Руководитель учебного центра {{org_director_short}}</p>
  <p>_____________________________________</p>
</div>
`),
  },

  /* ═══════════════════════ РАСПИСАНИЕ ═══════════════════════ */
  {
    doc_type: "schedule",
    title: "Расписание учебных занятий",
    hint: "По образцу ГОРЭЛТЕХ",
    requiredKeys: ["program_title", "group_number", "start_date", "end_date"],
    body_html: PAGE(`
<h1>Расписание учебных занятий</h1>
<p class="center"><strong>«{{program_title}}»</strong></p>
<p class="center">{{program_hours}} ак. ч. · Группа {{group_number}}</p>
<p class="center">Срок: {{start_date}} — {{end_date}}</p>

<table>
  <thead>
    <tr>
      <th>Дата</th>
      <th>Время</th>
      <th>Тема / модуль</th>
      <th>Часов</th>
      <th>Преподаватель</th>
    </tr>
  </thead>
  <tbody>{{schedule_rows}}</tbody>
</table>

<p class="small">Режим документа: {{fill_mode}}. {{schedule_notice}}</p>
<p class="small">{{layout_notice}}</p>

<div class="sig">
  <p>Преподаватель: _________________ / {{org_director_short}} /</p>
  <p>Руководитель учебного центра: _________________ / {{org_director_short}} /</p>
</div>
`),
  },

  /* ═══════════════════════ ИТОГОВАЯ ВЕДОМОСТЬ ═══════════════════════ */
  {
    doc_type: "attestation_sheet",
    title: "Ведомость итоговой аттестации",
    hint: "По образцу ГОРЭЛТЕХ",
    requiredKeys: ["group_number", "program_title", "end_date", "attestation_rows"],
    body_html: PAGE(`
<h1>ВЕДОМОСТЬ итоговой аттестации</h1>
<p class="center">Дата {{end_date}} &nbsp;&nbsp; N _{{group_number}}/ИА</p>
<p class="center">Программа повышения квалификации «{{program_title}}».</p>
<p class="center">Группа {{group_number}}</p>
<p class="center">Объём программы {{program_hours}} час. &nbsp; Срок обучения {{start_date}} – {{end_date}}</p>
<p class="center">Вид итоговой аттестации: <strong>Экзамен</strong></p>

<table>
  <thead>
    <tr>
      <th style="width:40px">N пп</th>
      <th>Фамилия, имя, отчество</th>
      <th style="width:110px">Процент баллов</th>
      <th style="width:80px">Оценка</th>
    </tr>
  </thead>
  <tbody>{{attestation_rows}}</tbody>
</table>

<p class="small">Режим документа: {{fill_mode}}. Источник: {{attestation_source_note}}</p>
<p class="small">{{layout_notice}}</p>

<div class="sig">
  <p>Подпись преподавателя _____________ / {{org_director_short}} /</p>
  <p class="mt">Руководитель учебного центра ___________ {{org_director_short}}</p>
</div>
`),
  },

  /* ═══════════════════════ КНИГА РЕГИСТРАЦИИ (ФРДО) ═══════════════════════ */
  {
    doc_type: "registration_book",
    title: "Книга регистрации выдачи документов",
    hint: "Данные для ФИС ФРДО по образцу ГОРЭЛТЕХ",
    requiredKeys: ["org_name", "registration_rows"],
    body_html: PAGE(`
<h1>Книга регистрации выдачи документов о квалификации</h1>
<p class="center">{{org_name}}</p>
<p class="center small">Данные для передачи в ФИС ФРДО</p>

<table style="font-size:10px">
  <thead>
    <tr>
      <th>№</th>
      <th>Вид документа</th>
      <th>Программа / группа</th>
      <th>Серия</th>
      <th>Номер</th>
      <th>ФИО</th>
      <th>Дата рожд.</th>
      <th>Пол</th>
      <th>Документ, удост. личность</th>
      <th>Гражданство</th>
      <th>Приказ</th>
      <th>Дата выдачи</th>
      <th>Подп. рук.</th>
      <th>Получил</th>
    </tr>
  </thead>
  <tbody>{{registration_rows}}</tbody>
</table>

<p class="small">Режим документа: {{fill_mode}}. Источник: {{registration_source_note}}</p>
<p class="small">{{layout_notice}}</p>

<div class="sig">
  <p>Ответственный: _________________ / {{org_director_name}} /</p>
</div>
`),
  },

  /* ═══════════════════════ ТИТУЛЬНЫЙ ЛИСТ ═══════════════════════ */
  {
    doc_type: "title_page",
    title: "Титульный лист группы",
    hint: "По образцу ГОРЭЛТЕХ «ДЕЛО группы»",
    requiredKeys: ["org_name", "group_number", "program_title"],
    body_html: PAGE(`
<div style="margin-top:40px" class="center">
  <p>Учебный центр Общества с ограниченной ответственностью<br/>
  «Инжиниринговый центр «ГОРЭЛТЕХ»</p>
  <p>({{org_short_name}})</p>

  <h1 style="margin-top:56px;font-size:20px;letter-spacing:0.08em">ДЕЛО</h1>
  <p style="margin-top:10px">группы слушателей курсов<br/>
  дополнительного профессионального образования</p>

  <p style="margin-top:28px;font-size:18px"><strong>№ {{group_number}}</strong></p>

  <p style="margin-top:36px">По программе: {{program_title}}</p>
  <p>Сроки проведения с {{start_date}} по {{end_date}}</p>
  <p class="mt">Обучающихся: {{students_count}}</p>

  <p style="margin-top:72px">г. Санкт-Петербург {{year}} г.</p>
</div>
`),
  },

  /* ═══════════════════════ ПРОПУСК / СПИСОК НА ДАТЫ ═══════════════════════ */
  {
    doc_type: "pass",
    title: "Пропуск / список на занятия",
    hint: "По образцу ГОРЭЛТЕХ: ФИО, организация, контакты, даты",
    requiredKeys: ["group_number", "program_title", "pass_rows"],
    body_html: PAGE(`
<p class="center"><strong>Группа обучающихся № {{group_number}}</strong></p>
<p class="center">курса «{{program_title}}»</p>
<p class="center">{{program_hours}} часов</p>
<p class="center">Количество человек: {{students_count}}</p>
<p class="center small">{{contract_basis_line}}</p>

<table style="font-size:11px">
  <thead>
    <tr>
      <th rowspan="2" style="width:28px">№</th>
      <th rowspan="2">ФИО</th>
      <th rowspan="2">Организация</th>
      <th rowspan="2">E-mail</th>
      <th rowspan="2">Тел.</th>
      <th colspan="4">Даты</th>
    </tr>
    <tr>
      <th>{{day1_date}}</th>
      <th>{{day2_date}}</th>
      <th>{{day3_date}}</th>
      <th>{{day4_date}}</th>
    </tr>
  </thead>
  <tbody>{{pass_rows}}</tbody>
</table>
`),
  },
];

export function getTemplate(docType: DocType): DocTemplate | undefined {
  return TEMPLATES.find((t) => t.doc_type === docType);
}

export function getAllTemplates(): DocTemplate[] {
  return TEMPLATES;
}
