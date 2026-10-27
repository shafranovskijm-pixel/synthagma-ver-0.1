import React from 'react';
import { issuanceRecordSchema } from '@/lib/educationIssuance/contract';
import type { IssuanceRecord } from '@/lib/educationIssuance/types';
import { sameCopyValue } from '@/lib/copyRegistry/value';

type Proof = NonNullable<IssuanceRecord['proof']>;
type Trace = { state: 'captured'; title: string; proof: Proof }
  | { state: 'legacy' | 'unavailable' | 'unconfirmed' };

function recordedTrace(record: IssuanceRecord): Trace {
  const parsed = issuanceRecordSchema.safeParse(record);
  if (!parsed.success) return { state: 'unconfirmed' };
  const row = parsed.data as IssuanceRecord;
  if (row.provenance === 'legacy_unverified') return { state: 'legacy' };
  if (row.proof_availability === 'currently_unavailable') return { state: 'unavailable' };
  const proof = row.proof;
  if (row.proof_availability !== 'captured' || !proof || !row.frdo_facts
    || row.frdo_facts.program_title !== row.official.specialty_name) return { state: 'unconfirmed' };
  const association = { organization_id: proof.organization_id, group_id: proof.group_id,
    enrollment_id: proof.enrollment_id, user_id: proof.user_id, course_id: proof.course_id };
  const outcome = proof.outcome_ref.scope;
  if (!sameCopyValue(proof.admission_ref.scope, association)
    || !sameCopyValue(proof.admission_ref.program_ref, proof.program_ref)
    || Object.entries(association).some(([key, value]) => outcome[key as keyof typeof outcome] !== value)
    || outcome.program_enrollment_snapshot_id !== proof.program_ref.enrollment_snapshot_id
    || outcome.program_version_id !== proof.program_ref.version_id
    || proof.identity_ref.user_id !== proof.user_id) return { state: 'unconfirmed' };
  return { state: 'captured', title: row.frdo_facts.program_title, proof };
}

function criteriaTime(value: string) {
  return `${new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(value))} (UTC)`;
}

/** Presents only the already-authorized, strictly validated issuance DTO. No current-version lookup. */
export function IssuanceProvenanceDetails({ record }: { record: IssuanceRecord }) {
  const trace = recordedTrace(record);
  if (trace.state !== 'captured') {
    const message = trace.state === 'legacy' ? 'Для прежней записи точное основание выдачи не подтверждено.'
      : trace.state === 'unavailable' ? 'Основание недоступно с текущими правами.'
        : 'Сведения об основании не удалось подтвердить.';
    return <section aria-label="Основание выданного документа" className="rounded-xl border p-4 space-y-2">
      <h3 className="font-medium">Основание выданного документа</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
    </section>;
  }
  const { proof, title } = trace;
  const program = proof.program_ref, outcome = proof.outcome_ref, criteria = outcome.criteria_ref;
  const references: Array<[string, string | number]> = [
    ['Курс', proof.course_id], ['Группа', proof.group_id], ['Зачисление', proof.enrollment_id],
    ['Редакция программы', program.version_id], ['Документ программы', program.file_document_id],
    ['Версия файла программы', program.file_version_id], ['Согласование файла', program.file_review_id],
    ['Связь программы с группой', program.binding_id], ['Редакция связи', program.binding_revision],
    ['Снимок программы для зачисления', program.enrollment_snapshot_id],
    ['Хэш сведений программы', program.facts_hash], ['Хэш снимка программы и группы', program.snapshot_hash],
    ['Версия критериев', criteria.id], ['Хэш критериев', criteria.content_hash],
    ['Расчёт результата', outcome.machine_result_id], ['Хэш исходных сведений расчёта', outcome.machine_input_hash],
    ['Решение об аттестации', outcome.decision_id], ['Хэш основания выдачи', proof.source_hash],
  ];
  return <section aria-label="Основание выданного документа" className="rounded-xl border p-4 space-y-3">
    <h3 className="font-medium">Основание выданного документа</h3>
    <p className="text-sm text-muted-foreground">Сведения зафиксированы при выдаче. Новая редакция курса их не заменяет.</p>
    <dl className="space-y-2 text-sm">
      <div><dt className="text-xs text-muted-foreground">Программа при выдаче</dt><dd className="break-words">{title}</dd></div>
      <div><dt className="text-xs text-muted-foreground">Программа и файл</dt><dd>Точная редакция и версия файла указаны в сохранённом основании.</dd></div>
      <div><dt className="text-xs text-muted-foreground">Критерии результата</dt><dd>Редакция {criteria.revision} · утверждение критериев <time dateTime={criteria.approved_at}>{criteriaTime(criteria.approved_at)}</time></dd></div>
      <div><dt className="text-xs text-muted-foreground">Основание решения об аттестации</dt><dd>{outcome.decision_basis === 'machine' ? 'Расчёт по утверждённым критериям' : 'Признание результатов по согласованному основанию'}</dd></div>
    </dl>
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">Точные ссылки для проверки</summary>
      <dl className="space-y-2 pt-3">{references.map(([label, value]) => <div key={label}>
        <dt className="text-xs text-muted-foreground">{label}</dt><dd><code className="break-all text-xs">{value}</code></dd>
      </div>)}</dl>
      <p className="pt-3 text-xs text-muted-foreground">Хэши относятся к сохранённым сведениям и связям. Текущая доступность файла проверяется отдельно.</p>
    </details>
  </section>;
}
