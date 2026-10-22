import { supabase } from '@/integrations/supabase/client';
import { captureCustomJournalScope, customJournalScopeCurrent, type CustomJournalScope } from '@/lib/customJournals/client';
import { journalUuid } from '@/lib/customJournals/contract';
import * as c from './contract';

export interface CopyRegistryScope extends CustomJournalScope { registryScope: c.CopyScope }
import { CopyRegistryError, normalizeCopyRegistryError } from './errors';
import { sameCopyValue } from './value';
export { CopyRegistryError, normalizeCopyRegistryError, copyRegistryMessages } from './errors';
export { sameCopyValue } from './value';
export function captureCopyRegistryScope(organizationId: string, registryScope: c.CopyScope, current?: () => boolean): CopyRegistryScope {
  const parsed = c.copyScopeSchema.safeParse(structuredClone(registryScope));
  if (!parsed.success) throw new CopyRegistryError('ACCESS_DENIED');
  try { return { ...captureCustomJournalScope(organizationId, current), registryScope: Object.freeze(parsed.data as c.CopyScope) }; }
  catch { throw new CopyRegistryError('ACCESS_DENIED'); }
}
export const copyRegistryScopeCurrent = (scope: CopyRegistryScope) => customJournalScopeCurrent(scope);
function requireCurrent(scope: CopyRegistryScope) { if (!copyRegistryScopeCurrent(scope)) throw new CopyRegistryError('ACCESS_DENIED'); }
async function call(scope: CopyRegistryScope, name: string, args: Record<string, unknown>) {
  requireCurrent(scope);
  const { data, error } = await supabase.auth.getSession();
  requireCurrent(scope);
  if (error || data.session?.user.id !== scope.actorId || !data.session.access_token) throw new CopyRegistryError('ACCESS_DENIED');
  const result = await supabase.rpc(name as never, args as never).setHeader('Authorization', 'Bearer ' + data.session.access_token);
  requireCurrent(scope);
  if (result.status === 401 || result.status === 403) throw new CopyRegistryError('ACCESS_DENIED');
  if (result.error) throw normalizeCopyRegistryError(result.error);
  const failure = c.copyErrorSchema.safeParse(result.data);
  if (failure.success) throw new CopyRegistryError(failure.data.code);
  return result.data;
}
function envelope(scope: CopyRegistryScope, result: { organization_id: string; scope: c.CopyScope; capabilities: c.CopyCapabilities }) {
  const caps = result.capabilities;
  if (result.organization_id !== scope.organizationId || !c.sameCopyScope(result.scope, scope.registryScope) || !caps.can_read
    || caps.can_create && !caps.can_write || caps.can_import && !caps.can_write
    || scope.registryScope.kind === 'group' && (caps.can_import || caps.can_inventory_local)) throw new CopyRegistryError();
}
function recordsInScope(scope: CopyRegistryScope, records: c.CopyRecord[]) {
  const context = scope.registryScope;
  if (context.kind === 'group' && records.some(record => record.group_id !== context.group_id)) throw new CopyRegistryError();
}
function ordered<T>(rows: T[], id: (row: T) => string, after: string | null, next: string | null) {
  let previous = after;
  for (const row of rows) { const value = id(row); if (previous !== null && value <= previous) throw new CopyRegistryError(); previous = value; }
  if (next !== null && (!rows.length || next !== previous || next === after)) throw new CopyRegistryError();
}
async function importResultValid(value: c.CopyImport) {
  if (value.row_count !== value.rows.length || value.rows.some((row, index) => row.index !== index || row.valid && !row.candidate)) throw new CopyRegistryError();
  const bytes = new TextEncoder().encode(value.source_raw);
  if (bytes.length > 2 * 1024 * 1024 || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== value.source_raw) throw new CopyRegistryError();
  const rawDigest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  const rawHash = Array.from(new Uint8Array(rawDigest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (rawHash !== value.source_sha256) throw new CopyRegistryError();
  let decoded: unknown;
  try { decoded = JSON.parse(value.source_raw); }
  catch { if (value.rows.length !== 1 || value.rows[0].valid || value.rows[0].candidate || !value.rows[0].conflicts.includes('INVALID_JSON')) throw new CopyRegistryError(); }
  const wholeFormatRefusal = value.rows.length === 1 && value.rows[0].index === 0 && !value.rows[0].valid && value.rows[0].candidate === null
    && value.rows[0].source_digest === rawHash && value.rows[0].conflicts.includes('UNSUPPORTED_FORMAT');
  // PostgreSQL JSONB cannot represent some syntactically valid JS JSON (escaped NUL/surrogate or numeric overflow).
  // One explicit whole-source refusal is different from silently returning only part of an ordinary array.
  if (Array.isArray(decoded)) { if (decoded.length !== value.rows.length && !wholeFormatRefusal) throw new CopyRegistryError(); }
  else if (decoded !== undefined && (value.rows.length !== 1 || value.rows[0].valid || value.rows[0].candidate || !value.rows[0].conflicts.includes('UNSUPPORTED_FORMAT'))) throw new CopyRegistryError();
  if (value.status === 'applied') {
    if (!value.report || value.report.decisions.length !== value.row_count || value.report.imported + value.report.reused + value.report.skipped !== value.row_count
      || value.report.decisions.some((decision, index) => decision.index !== index)) throw new CopyRegistryError();
  } else if (value.report !== null) throw new CopyRegistryError();
}
export async function readCopyRegistry(scope: CopyRegistryScope, query: c.CopyQuery): Promise<c.CopyRead> {
  const q = c.copyQuerySchema.parse(structuredClone(query)) as c.CopyQuery;
  const parsed = c.copyReadSchema.safeParse(await call(scope, 'read_copy_registry', { p_org: scope.organizationId, p_scope: scope.registryScope, p_query: q }));
  if (!parsed.success) throw new CopyRegistryError();
  const result = parsed.data as c.CopyRead;
  envelope(scope, result);
  if (result.kind !== q.kind) throw new CopyRegistryError();
  if (result.kind === 'list' && q.kind === 'list') { recordsInScope(scope, result.records); ordered(result.records, row => row.id, q.after_id, result.next_after_id); }
  if (result.kind === 'detail' && q.kind === 'detail') { if (result.record.id !== q.record_id) throw new CopyRegistryError(); recordsInScope(scope, [result.record]); }
  if (result.kind === 'history' && q.kind === 'history') {
    let previous = q.after_revision ?? 0;
    for (const row of result.history) { if (row.record_id !== q.record_id || row.revision <= previous) throw new CopyRegistryError(); previous = row.revision; }
    if (result.next_after_revision !== null && (!result.history.length || result.next_after_revision !== previous)) throw new CopyRegistryError();
  }
  if (result.kind === 'originals' && q.kind === 'originals') ordered(result.originals, row => row.original.version_id, q.after_id, result.next_after_id);
  if (result.kind === 'people' && q.kind === 'people') ordered(result.people, row => row.user_id, q.after_id, result.next_after_id);
  if (result.kind === 'imports' && q.kind === 'imports') {
    if (!result.capabilities.can_inventory_local) throw new CopyRegistryError('ACCESS_DENIED');
    ordered(result.imports, row => row.id, q.after_id, result.next_after_id);
  }
  if (result.kind === 'import' && q.kind === 'import') {
    if (!result.capabilities.can_inventory_local || result.import.id !== q.import_id) throw new CopyRegistryError('ACCESS_DENIED');
    await importResultValid(result.import);
  }
  if (result.kind === 'exports' && q.kind === 'exports') ordered(result.exports, row => row.id, q.after_id, result.next_after_id);
  if (result.kind === 'export' && q.kind === 'export' && (result.export.id !== q.export_id || !result.capabilities.can_export)) throw new CopyRegistryError('SOURCE_UNAVAILABLE');
  requireCurrent(scope);
  return result;
}
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
export function prepareCopyRegistryMutation(scope: CopyRegistryScope, expectedRevision: number, action: c.CopyAction, requestId: string = crypto.randomUUID()) {
  requireCurrent(scope);
  const parsed = c.copyActionSchema.safeParse(structuredClone(action));
  if (!parsed.success || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !journalUuid.safeParse(requestId).success) throw new CopyRegistryError('INVALID_INPUT');
  const saved = freeze(parsed.data as c.CopyAction);
  if ((saved.action === 'create' || saved.action === 'preview_import') && expectedRevision !== 0) throw new CopyRegistryError('INVALID_INPUT');
  const args = freeze({ p_org: scope.organizationId, p_scope: scope.registryScope, p_expected_revision: expectedRevision, p_request_id: requestId, p_action: saved });
  return { requestId, action: saved, expectedRevision, run: async (): Promise<c.CopyMutation> => {
    requireCurrent(scope);
    const parsedResult = c.copyMutationSchema.safeParse(await call(scope, 'apply_copy_registry_action', args));
    if (!parsedResult.success) throw new CopyRegistryError();
    const result = parsedResult.data as c.CopyMutation;
    envelope(scope, result);
    if (result.kind !== saved.action || result.request_id !== requestId || (saved.action === 'capture_export' ? !result.capabilities.can_export : !result.capabilities.can_write)) throw new CopyRegistryError();
    if ('record' in result) {
      recordsInScope(scope, [result.record]);
      if ('record_id' in saved && saved.record_id !== result.record.id) throw new CopyRegistryError();
      const appliedRevision = saved.action === 'create' ? 1 : expectedRevision + 1;
      if (result.record.revision < appliedRevision || !result.replayed && result.record.revision !== appliedRevision) throw new CopyRegistryError();
      if ((saved.action === 'create' || saved.action === 'update') && result.record.revision === appliedRevision && !sameCopyValue(result.record.data, saved.data)) throw new CopyRegistryError();
      if (saved.action === 'archive' && !result.record.archived) throw new CopyRegistryError();
      if (saved.action === 'transfer' && result.record.revision === appliedRevision) {
        const transfer = result.record.latest_transfer;
        if (!transfer || transfer.recorded_by !== scope.actorId || !sameCopyValue({ method: transfer.method, reported_date: transfer.reported_date, note: transfer.note, evidence: transfer.evidence }, saved.transfer)) throw new CopyRegistryError();
      }
    }
    if ('import' in result) {
      if (!result.capabilities.can_import) throw new CopyRegistryError('ACCESS_DENIED');
      await importResultValid(result.import);
      if (saved.action === 'preview_import' && (result.import.source_raw !== saved.source_raw || result.import.source_sha256 !== saved.source_sha256)) throw new CopyRegistryError();
      if (saved.action === 'apply_import' && (result.import.id !== saved.import_id || result.import.source_sha256 !== saved.source_sha256 || result.import.preview_hash !== saved.preview_hash
        || result.import.status !== 'applied' || !sameCopyValue(result.import.report?.decisions, saved.decisions))) throw new CopyRegistryError();
    }
    if ('export' in result && (result.export.registry_revision !== expectedRevision || !result.capabilities.can_export)) throw new CopyRegistryError();
    requireCurrent(scope);
    return result;
  } };
}
