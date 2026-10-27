import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { IssuanceProvenanceDetails } from '../IssuanceProvenanceDetails';
import { issuedRecord, uid } from '@/lib/educationIssuance/__tests__/fixtures';
import type { IssuanceRecord } from '@/lib/educationIssuance/types';

const transport = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: transport.rpc } }));

beforeEach(() => {
  transport.rpc.mockReset(); transport.fetch.mockReset();
  // A future registry response must never become the source of an old issued document.
  transport.rpc.mockResolvedValue({ data: { current_version: { id: uid(922), title: 'Текущая программа V2' } }, error: null });
  vi.stubGlobal('fetch', transport.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function panel() { return screen.getByRole('region', { name: 'Основание выданного документа' }); }
function noCapturedReferences(container: HTMLElement, record: IssuanceRecord) {
  expect(container.querySelector('details')).toBeNull();
  expect(container.textContent).not.toContain(record.proof!.program_ref.version_id);
  expect(container.textContent).not.toContain(record.proof!.program_ref.file_version_id);
  expect(container.textContent).not.toContain(record.frdo_facts!.program_title);
}
const damagedCases: Array<[string, (record: IssuanceRecord) => void]> = [
  ['unknown proof availability', r => { (r as unknown as { proof_availability: string }).proof_availability = 'unknown'; }],
  ['missing proof', r => { r.proof = null; }],
  ['partial programme reference', r => { delete (r.proof!.program_ref as Partial<NonNullable<IssuanceRecord['proof']>['program_ref']>).file_version_id; }],
  ['malformed programme hash', r => { r.proof!.program_ref.facts_hash = 'not-a-hash'; }],
  ['foreign official subject', r => { r.proof!.organization_id = uid(702); }],
  ['different outcome programme', r => { r.proof!.outcome_ref.scope.program_version_id = uid(722); }],
  ['different enrollment snapshot', r => { r.proof!.outcome_ref.scope.program_enrollment_snapshot_id = uid(720); }],
  ['different admission programme', r => { r.proof!.admission_ref.program_ref = { ...r.proof!.program_ref, version_id: uid(822) }; }],
];

describe('Issued document recorded programme provenance', () => {
  it('keeps the issued V1 programme/file/criteria/result while the current registry would return V2', () => {
    const record = issuedRecord();
    render(<IssuanceProvenanceDetails record={record} />);
    const details = panel();
    expect(within(details).getByText(record.frdo_facts!.program_title)).toBeTruthy();
    for (const ref of [record.proof!.program_ref.version_id, record.proof!.program_ref.file_version_id,
      record.proof!.program_ref.enrollment_snapshot_id, record.proof!.outcome_ref.criteria_ref.id,
      record.proof!.outcome_ref.machine_result_id, record.proof!.outcome_ref.decision_id]) {
      expect(details.textContent).toContain(ref);
    }
    expect(details.textContent).not.toContain(uid(922));
    expect(details.textContent).not.toContain('Текущая программа V2');
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it('renders the exact recorded criteria approval time and decision basis without inventing scores or programme version numbers', () => {
    const record = issuedRecord(); record.proof!.outcome_ref.decision_basis = 'recognition';
    render(<IssuanceProvenanceDetails record={record} />);
    expect(panel().querySelector('time')?.getAttribute('datetime')).toBe(record.proof!.outcome_ref.criteria_ref.approved_at);
    expect(within(panel()).getByText('Признание результатов по согласованному основанию')).toBeTruthy();
    expect(panel().textContent).not.toContain('100%');
    expect(panel().textContent).not.toContain('Программа утверждена');
  });

  it('updates references for another issued record without retaining the previous record in component state', () => {
    const old = issuedRecord(); const next = structuredClone(old);
    next.proof!.program_ref.version_id = uid(122);
    next.proof!.outcome_ref.scope.program_version_id = uid(122);
    next.proof!.admission_ref.program_ref.version_id = uid(122);
    next.proof!.program_ref.file_version_id = uid(124);
    next.proof!.admission_ref.program_ref.file_version_id = uid(124);
    next.frdo_facts!.program_title = 'Другая зафиксированная программа'; next.official.specialty_name = next.frdo_facts!.program_title;
    const view = render(<IssuanceProvenanceDetails record={old} />);
    view.rerender(<IssuanceProvenanceDetails record={next} />);
    expect(panel().textContent).toContain(uid(122)); expect(panel().textContent).toContain(uid(124));
    expect(panel().textContent).not.toContain(old.proof!.program_ref.version_id);
    expect(panel().textContent).not.toContain(old.proof!.program_ref.file_version_id);
    expect(panel().textContent).not.toContain(old.frdo_facts!.program_title);
  });

  it('keeps a legacy record explicitly unconfirmed instead of using its old course title as a confirmed programme', () => {
    const source = issuedRecord(); const legacy = structuredClone(source);
    legacy.provenance = 'legacy_unverified'; legacy.proof_availability = 'legacy_unverified'; legacy.proof = null;
    legacy.frdo_facts = null; legacy.artifact = { availability: 'legacy_unverified', artifact: null };
    render(<IssuanceProvenanceDetails record={legacy} />);
    expect(panel().textContent).toContain('Для прежней записи точное основание выдачи не подтверждено.');
    noCapturedReferences(panel(), source);
  });

  it('purges previously visible references immediately when the next authorized DTO masks the proof', () => {
    const source = issuedRecord(); const masked = structuredClone(source);
    masked.proof_availability = 'currently_unavailable'; masked.proof = null;
    const view = render(<IssuanceProvenanceDetails record={source} />);
    view.rerender(<IssuanceProvenanceDetails record={masked} />);
    expect(panel().textContent).toContain('Основание недоступно с текущими правами.');
    noCapturedReferences(panel(), source);
    expect(transport.rpc).not.toHaveBeenCalled();
  });

  it.each(damagedCases)('fails closed for %s without displaying a fallback programme or partial audit identifiers', (_name, damage) => {
    const source = issuedRecord(); const damaged = structuredClone(source); damage(damaged);
    render(<IssuanceProvenanceDetails record={damaged} />);
    expect(panel().textContent).toContain('Сведения об основании не удалось подтвердить.');
    noCapturedReferences(panel(), source);
  });

  it('escapes recorded strings as text and exposes no raw JSON or private identity/admission evidence fields', () => {
    const record = issuedRecord(); const injected = '<img src=x onerror="alert(1)"><script>bad()</script>';
    record.frdo_facts!.program_title = injected; record.official.specialty_name = injected;
    record.official.full_name = 'ЛИШНЕЕ_ФИО_НЕ_ПОКАЗЫВАТЬ';
    render(<IssuanceProvenanceDetails record={record} />);
    expect(within(panel()).getByText(injected)).toBeTruthy();
    expect(panel().querySelector('img,script')).toBeNull();
    expect(panel().textContent).not.toContain(record.official.full_name);
    expect(panel().textContent).not.toContain(record.proof!.admission_ref.case_id);
    expect(panel().textContent).not.toContain('identity_ref');
    expect(panel().textContent).not.toContain('evidence_refs');
  });

  it('is read-only when audit details are opened: no network, approval, navigation or mutation controls', () => {
    const record = issuedRecord(); const before = structuredClone(record);
    render(<IssuanceProvenanceDetails record={record} />);
    fireEvent.click(within(panel()).getByText('Точные ссылки для проверки'));
    expect(panel().querySelector('button,a,form,input,select,textarea')).toBeNull();
    expect(transport.rpc).not.toHaveBeenCalled(); expect(transport.fetch).not.toHaveBeenCalled();
    expect(record).toEqual(before);
  });
});
