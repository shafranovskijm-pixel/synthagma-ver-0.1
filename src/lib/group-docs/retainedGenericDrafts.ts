import type { EducationArtifactCalendar, EducationArtifactSnapshot } from '../../../supabase/functions/_shared/group-education-artifact.ts';
import { parseEducationArtifactSnapshot, EDUCATION_GENERIC_ARTIFACT_NOTICE } from '../../../supabase/functions/_shared/group-education-artifact.ts';
import type { DocType, GenerationContext } from './schema.ts';

export const GENERIC_EDUCATION_DRAFT_TYPES = ["enrollment_order", "class_journal", "attestation_sheet"] as const;
export type GenericEducationDraftType = typeof GENERIC_EDUCATION_DRAFT_TYPES[number];
export const isGenericEducationDraftType = (value: DocType): value is GenericEducationDraftType => (GENERIC_EDUCATION_DRAFT_TYPES as readonly string[]).includes(value);
const esc = (value: unknown) => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const known = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "Не указано";
const dateLabel = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(8,10)+"."+value.slice(5,7)+"."+value.slice(0,4) : value;
const localClock = (value: string, timezone: string) => new Intl.DateTimeFormat("ru-RU",{timeZone:timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));
const localDay = (value: string, timezone: string) => new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
function lessonClock(lesson: EducationArtifactCalendar["lessons"][number], timezone: string): string {
 if (!lesson.starts_at || !lesson.ends_at) return "Время не задано";
 const endDay = localDay(lesson.ends_at,timezone);
 return localClock(lesson.starts_at,timezone)+"–"+localClock(lesson.ends_at,timezone)+(endDay !== lesson.local_date ? " (окончание "+dateLabel(endDay)+")" : "");
}
/** One column per retained planned lesson, even on the same date; no attendance is inferred. */
export function retainedCalendarJournal(calendar: EducationArtifactCalendar, students: ReadonlyArray<{user_id:string;full_name:string}>) {
 const head = calendar.lessons.map(lesson=>"<th>"+esc(dateLabel(lesson.local_date))+"<br>"+esc(lessonClock(lesson,calendar.timezone))+"<br>"+esc(lesson.topic)+"<br>"+esc(lesson.academic_hours)+" акад. ч.<br>"+esc(known(lesson.teacher_label))+"</th>").join("");
 const rows = students.map((student,index)=>"<tr><td>"+(index+1)+"</td><td>"+esc(student.full_name)+"</td>"+calendar.lessons.map(()=>"<td></td>").join("")+"</tr>").join("");
 return {head,rows};
}
export function genericDraftMissingRequisites(ctx: GenerationContext): string[] {
 const values = [["название организации",ctx.organization.name],["ИНН",ctx.organization.inn],["руководитель",ctx.organization.director_name],["должность руководителя",ctx.organization.director_position]];
 return values.filter(([,value])=>!value?.trim()).map(([label])=>label);
}
/** A technical draft from one retained source. It does not establish attendance, grades, issuance or legal names. */
export function renderRetainedGenericDraft(ctx: GenerationContext, type: GenericEducationDraftType, source: EducationArtifactSnapshot, documentDate: string): string {
 const snapshot = parseEducationArtifactSnapshot(source,ctx.organization.id!,ctx.group.id,"generic_html");
 const calendar = snapshot.projection.calendar;
 const proof = snapshot.projection.program_facts;
 const facts = proof.facts_snapshot!;
 const titles = {enrollment_order:"Черновик приказа о зачислении",class_journal:"Черновик журнала учёта занятий",attestation_sheet:"Черновик итоговой ведомости"};
 const missing = genericDraftMissingRequisites(ctx);
 const roster = snapshot.rows.map((row,index)=>"<tr><td>"+(index+1)+"</td><td>"+esc(row.subject_label)+"</td>"+(type==="attestation_sheet"?"<td>Не подтверждён этим источником</td><td></td>":"")+"</tr>").join("");
 const journal = retainedCalendarJournal(calendar,snapshot.rows.map(row=>({user_id:row.user_id,full_name:row.subject_label!})));
 const lessons = calendar.lessons.map((lesson,index)=>"<tr><td>"+(index+1)+"</td><td>"+esc(dateLabel(lesson.local_date))+"</td><td>"+esc(lessonClock(lesson,calendar.timezone))+"</td><td>"+esc(lesson.topic)+"</td><td>"+esc(lesson.module_label||"")+"</td><td>"+esc(lesson.academic_hours)+"</td><td>"+esc(known(lesson.teacher_label))+"</td></tr>").join("");
 const sourceRows = [["Снимок состава",snapshot.source.snapshot_id],["Хеш источника",snapshot.source.source_hash],["Хеш состава",snapshot.source.roster_hash],["Версия календаря",snapshot.source.calendar_version_id],["Хеш календаря",snapshot.source.calendar_hash],["Состав на",snapshot.source.as_of],["Ревизия сведений",snapshot.source.knowledge_revision],["Часовой пояс",snapshot.source.timezone]].map(([label,value])=>"<tr><th>"+esc(label)+"</th><td>"+esc(value)+"</td></tr>").join("");
 const main = type==="class_journal" ? "<p>Плановые занятия. Все ячейки отметок оставлены пустыми: этот источник не подтверждает посещение.</p><table><thead><tr><th>№</th><th>Отображаемая подпись ученика</th>"+journal.head+"</tr></thead><tbody>"+journal.rows+"</tbody></table>" : "<p>"+(type==="enrollment_order"?"Проект состава для зачисления; документ требует проверки и решения уполномоченного лица.":"Проект ведомости по сохранённому составу. Результат обучения, допуск и решение об аттестации этим снимком не подтверждаются.")+"</p><table><thead><tr><th>№</th><th>Отображаемая подпись ученика</th>"+(type==="attestation_sheet"?"<th>Результат</th><th>Решение</th>":"")+"</tr></thead><tbody>"+roster+"</tbody></table>";
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>'+esc(titles[type])+'</title><style>body{font:14px Arial,sans-serif;color:#172033;margin:28px}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #bac2ce;padding:6px;text-align:left;vertical-align:top}.draft{padding:12px;border:2px solid #b45309;background:#fffbeb}.notice{font-size:12px;color:#475569}td{overflow-wrap:anywhere}</style></head><body><div class="draft"><strong>ЧЕРНОВИК — НЕ ВЫДАН, НЕ ПОДПИСАН</strong><p>Официальный номер не присвоен. Дата подготовки: '+esc(dateLabel(documentDate))+'. Требуется проверка уполномоченным сотрудником.</p></div><h1>'+esc(titles[type])+'</h1><p>'+esc(known(ctx.organization.name))+'; ИНН: '+esc(known(ctx.organization.inn))+'. Руководитель: '+esc(known(ctx.organization.director_name))+'; должность: '+esc(known(ctx.organization.director_position))+'.</p><p>Реквизиты для проверки: '+esc(missing.length?missing.join(", "):"пропусков в перечисленных полях не обнаружено; юридическая проверка не выполнена")+'.</p><p>Группа: '+esc(known(ctx.group.number))+' — '+esc(ctx.group.name)+'.</p><p>Программа: '+esc(facts.full_title)+'; вид программы: '+esc(facts.program_type)+'; объём: '+esc(facts.academic_hours)+' акад. ч.; форма: '+esc(ctx.group.program_form)+'. Форма аттестации из программы: '+esc(known(facts.attestation_form))+'.</p>'+main+'<h2>Полный план занятий из сохранённого календаря</h2><p>План не заменяет сведения о фактически проведённых занятиях.</p><table><thead><tr><th>№</th><th>Дата</th><th>Время</th><th>Тема</th><th>Раздел</th><th>Акад. ч.</th><th>Отображаемая подпись преподавателя</th></tr></thead><tbody>'+lessons+'</tbody></table><h2>Единый источник</h2><table>'+sourceRows+'</table><p class="notice">'+esc(EDUCATION_GENERIC_ARTIFACT_NOTICE)+'</p><p>Подпись: не проставлена. Решение об официальном оформлении не принято.</p></body></html>';
}
