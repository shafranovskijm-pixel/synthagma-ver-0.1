import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ current: true }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/individualEducationOrders/client', () => ({ individualOrderScopeCurrent: () => state.current,
  IndividualOrderError: class extends Error { constructor(readonly code: string) { super(code); } } }));
vi.mock('@/lib/documentRegistry/client', () => ({ captureDocumentRegistryScope: vi.fn(), readDocumentRegistry: vi.fn() }));
import { OrderBasisRevisionNotApplied, prepareOrderBasisRevision } from '../basisRevision';
import { saveDocumentUpload } from '@/lib/orgDocumentLifecycle';

const uuid = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const scope = () => ({ organizationId: uuid(1), enrollmentId: uuid(2), subjectUserId: uuid(3), courseId: uuid(4), actorId: uuid(5), accessRevision: 7 }) as any;
const pdf = () => { const body = '%PDF-owned corrected protocol'; const file = new File([body], 'Протокол.pdf', { type: 'application/pdf' });
  Object.defineProperty(file, 'arrayBuffer', { value: vi.fn(async () => new TextEncoder().encode(body).buffer) }); return file; };
const input = () => ({ file: pdf(), issueDate: '2026-11-24', reason: 'Указана дата исходного протокола; прежняя версия сохранена.' });
function port() {
  const metadata = { name: 'Протокол итоговой аттестации', type: 'other', issue_date: null, expires_at: null, responsible_person: 'Комиссия' };
  let head: any = { id: uuid(8), organization_id: uuid(1), ...metadata, status: 'active', deleted_at: null, document_revision: 3, current_version_id: uuid(9) };
  const saved: any = { id: head.id, organization_id: head.organization_id, name: head.name, type: head.type, status: head.status, deleted_at: null,
    document_revision: head.document_revision, current_version_id: head.current_version_id };
  const old: any = { id: uuid(9), document_id: head.id, organization_id: head.organization_id, version_number: 2, result_revision: 3, request_id: uuid(90),
    file_path: 'old/protocol.pdf', file_name: 'Протокол.pdf', file_size: 22, document_metadata: metadata };
  const review = Object.freeze({ id: uuid(91), document_id: head.id, version_id: old.id, decision: 'approved', revision: 1 });
  let rows: any[] = [structuredClone(old)], access = true;
  const upload = vi.fn(async () => ({ error: null })), remove = vi.fn();
  const commit = (args: any) => {
    if (args.p_expected_revision !== head.document_revision) throw Object.assign(new Error('stale revision'), { code: '40001' });
    const version = { ...structuredClone(old), id: uuid(10), version_number: 3, result_revision: 4, request_id: args.p_request_id,
      file_path: args.p_upload.file_path, file_name: args.p_upload.file_name, file_size: args.p_upload.file_size,
      document_metadata: { ...metadata, ...args.p_document } };
    rows = [version, ...rows]; head = { ...head, ...args.p_document, current_version_id: version.id, document_revision: 4 };
    return { document_id: head.id, version_id: version.id, revision: 4, version_number: 3, replayed: false };
  };
  const rpc = vi.fn(async (_name: string, args: any) => ({ data: commit(args), error: null }));
  const client: any = { storage: { from: () => ({ upload, remove, getPublicUrl: (path: string) => ({ data: { publicUrl: 'https://example.invalid/' + path } }) }) }, rpc };
  const transport: any = { key: 'basis-scope', assertCurrent: () => { if (!access) throw Object.assign(new Error('revoked'), { code: 'ACCESS_DENIED' }); },
    readDocument: vi.fn(async () => ({ data: structuredClone(head), error: null })),
    readVersions: vi.fn(async () => ({ data: structuredClone(rows), error: null })), saveUpload: vi.fn((op: any) => saveDocumentUpload(op, client)) };
  return { transport, saved, old, review, rpc, upload, remove, commit, getHead: () => head, setHead: (value: any) => { head = value; },
    getRows: () => rows, setRows: (value: any[]) => { rows = value; }, revoke: () => { access = false; } };
}
beforeEach(() => { state.current = true; vi.clearAllMocks(); });

describe('same-document explicit-date basis revision', () => {
  it('appends one dated immutable version through the existing CAS transport and preserves the old version/review', async () => {
    const p = port(), original = structuredClone(p.old), review = structuredClone(p.review), value = input();
    const op = await prepareOrderBasisRevision(scope(), p.transport, p.saved, value);
    expect(Object.isFrozen(op)).toBe(true); expect(p.transport.saveUpload).not.toHaveBeenCalled();
    const result = await op.run(), args = p.rpc.mock.calls[0][1];
    expect(args).toMatchObject({ p_document_id: p.saved.id, p_organization_id: uuid(1), p_expected_revision: 3,
      p_request_id: op.requestId, p_document: { issue_date: '2026-11-24' }, p_restore_version_id: null });
    expect(args.p_upload).toMatchObject({ file_path: `${uuid(1)}/versions/${p.saved.id}/${op.requestId}.pdf`, file_name: value.file.name, file_size: value.file.size, change_summary: value.reason });
    expect(result).toMatchObject({ id: p.saved.id, document_revision: 4, current_version_id: uuid(10) });
    expect(p.getRows()[0].document_metadata).toEqual({ ...original.document_metadata, issue_date: value.issueDate });
    expect(p.getRows()[1]).toEqual(original); expect(p.review).toEqual(review); expect(p.remove).not.toHaveBeenCalled();
  });
  it.each([
    ['missing date', { issueDate: '' }], ['impossible date', { issueDate: '2026-02-30' }],
    ['missing reason', { reason: '   ' }], ['control character', { reason: 'изменение\nдаты' }], ['long reason', { reason: 'x'.repeat(2001) }],
  ])('refuses %s before reading or mutating any document', async (_label, patch) => {
    const p = port(); await expect(prepareOrderBasisRevision(scope(), p.transport, p.saved, { ...input(), ...patch })).rejects.toThrow();
    expect(p.transport.readDocument).not.toHaveBeenCalled(); expect(p.transport.saveUpload).not.toHaveBeenCalled();
  });
  it('rejects non-PDF and oversized files without mutation', async () => {
    const p = port(), big = pdf(); Object.defineProperty(big, 'size', { value: 20971521 });
    for (const file of [big, new File(['not a PDF'], 'protocol.docx')]) await expect(prepareOrderBasisRevision(scope(), p.transport, p.saved, { ...input(), file })).rejects.toThrow('PDF');
    expect(big.arrayBuffer).not.toHaveBeenCalled(); expect(p.transport.saveUpload).not.toHaveBeenCalled();
  });
  it.each(['foreign', 'catalogue', 'stale', 'missing immutable metadata', 'mismatched current metadata'])('rejects %s source before upload', async condition => {
    const p = port(); let saved = p.saved;
    if (condition === 'foreign') saved = { ...saved, organization_id: uuid(88) };
    if (condition === 'catalogue') p.setHead({ ...p.getHead(), type: 'charter' });
    if (condition === 'stale') p.setHead({ ...p.getHead(), document_revision: 4 });
    if (condition === 'missing immutable metadata') p.setRows([{ ...p.old, document_metadata: null }]);
    if (condition === 'mismatched current metadata') p.setHead({ ...p.getHead(), responsible_person: 'Другой сотрудник' });
    await expect(prepareOrderBasisRevision(scope(), p.transport, saved, input())).rejects.toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(p.transport.saveUpload).not.toHaveBeenCalled();
  });
  it('retains the frozen request and file across a lost precommit response and edited form values', async () => {
    const p = port(), value = input(), op = await prepareOrderBasisRevision(scope(), p.transport, p.saved, value);
    p.rpc.mockRejectedValueOnce(new Error('transport unknown'));
    await expect(op.run()).rejects.toThrow('transport unknown'); const first = structuredClone(p.rpc.mock.calls[0][1]);
    value.issueDate = '2027-01-01'; value.reason = 'changed'; value.file = pdf();
    await op.run(); expect(p.rpc.mock.calls[1][1]).toEqual(first); expect(p.upload).toHaveBeenCalledTimes(1);
    expect(p.getRows()).toHaveLength(2); expect(p.remove).not.toHaveBeenCalled();
  });
  it('recovers a committed response loss using the same immutable request/version without a second write', async () => {
    const p = port(), op = await prepareOrderBasisRevision(scope(), p.transport, p.saved, input());
    p.rpc.mockImplementationOnce(async (_name, args) => { p.commit(args); throw new Error('ack lost after commit'); });
    await expect(op.run()).rejects.toThrow('ack lost'); const saved = await op.run();
    expect(saved.current_version_id).toBe(uuid(10)); expect(p.rpc).toHaveBeenCalledTimes(1); expect(p.upload).toHaveBeenCalledTimes(1); expect(p.getRows()).toHaveLength(2);
  });
  it('coalesces double clicks into one in-flight request', async () => {
    const p = port(), op = await prepareOrderBasisRevision(scope(), p.transport, p.saved, input());
    let release!: () => void; p.upload.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ error: null }); }));
    const first = op.run(), second = op.run(); expect(second).toBe(first);
    await vi.waitFor(() => expect(release).toBeTypeOf('function')); release(); await first;
    expect(p.rpc).toHaveBeenCalledTimes(1); expect(p.upload).toHaveBeenCalledTimes(1);
  });
  it('refuses an intervening revision before writing or falsely recovering another request', async () => {
    const p = port(), op = await prepareOrderBasisRevision(scope(), p.transport, p.saved, input());
    p.setHead({ ...p.getHead(), current_version_id: uuid(11), document_revision: 4 });
    p.setRows([{ ...p.old, id: uuid(11), version_number: 3, result_revision: 4, request_id: uuid(99) }, p.old]);
    await expect(op.run()).rejects.toBeInstanceOf(OrderBasisRevisionNotApplied); expect(p.transport.saveUpload).not.toHaveBeenCalled();
  });
  it('never labels an uncertain submitted operation as not applied on a later conflicting readback', async () => {
    const p = port(), op = await prepareOrderBasisRevision(scope(), p.transport, p.saved, input());
    p.rpc.mockRejectedValueOnce(new Error('unknown outcome')); await expect(op.run()).rejects.toThrow('unknown outcome');
    p.setHead({ ...p.getHead(), current_version_id: uuid(11), document_revision: 4 });
    p.setRows([{ ...p.old, id: uuid(11), version_number: 3, result_revision: 4, request_id: uuid(99) }, p.old]);
    const error = await op.run().catch(error => error);
    expect(error).toMatchObject({ code: 'SOURCE_CHANGED' }); expect(error).not.toBeInstanceOf(OrderBasisRevisionNotApplied);
    expect(p.rpc).toHaveBeenCalledTimes(1); expect(p.remove).not.toHaveBeenCalled();
  });
  it.each(['immutable date', 'request', 'path', 'document', 'result revision', 'preserved metadata', 'old version'])('rejects wrong %s readback instead of accepting the current-row date', async condition => {
    const p = port(), op = await prepareOrderBasisRevision(scope(), p.transport, p.saved, input());
    p.rpc.mockImplementationOnce(async (_name, args) => {
      const data = p.commit(args), rows = p.getRows();
      if (condition === 'immutable date') rows[0].document_metadata.issue_date = null;
      if (condition === 'request') rows[0].request_id = uuid(99);
      if (condition === 'path') rows[0].file_path = 'foreign/same-name.pdf';
      if (condition === 'document') rows[0].document_id = uuid(99);
      if (condition === 'result revision') rows[0].result_revision = 5;
      if (condition === 'preserved metadata') rows[0].document_metadata.responsible_person = 'Иной сотрудник';
      if (condition === 'old version') rows[1].document_metadata.issue_date = '2026-11-24';
      return { data, error: null };
    });
    const error = await op.run().catch(error => error);
    expect(error).toMatchObject({ code: 'SOURCE_CHANGED' }); expect(error).not.toBeInstanceOf(OrderBasisRevisionNotApplied); expect(p.remove).not.toHaveBeenCalled();
  });
  it('does not start or return a late result after actor/access loss', async () => {
    const p = port(), bound = scope(), op = await prepareOrderBasisRevision(bound, p.transport, p.saved, input());
    bound.actorId = uuid(66); expect(() => op.run()).toThrow('ACCESS_DENIED'); expect(p.transport.saveUpload).not.toHaveBeenCalled();
    bound.actorId = uuid(5); p.rpc.mockImplementationOnce(async (_name, args) => { const data = p.commit(args); state.current = false; return { data, error: null }; });
    await expect(op.run()).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    state.current = true; p.revoke(); expect(() => op.run()).toThrow('revoked');
  });
  it('ignores a descriptor response that arrives after revocation', async () => {
    const p = port(); p.transport.readVersions.mockImplementationOnce(async () => { state.current = false; return { data: [p.old], error: null }; });
    await expect(prepareOrderBasisRevision(scope(), p.transport, p.saved, input())).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    expect(p.transport.saveUpload).not.toHaveBeenCalled();
  });
});
