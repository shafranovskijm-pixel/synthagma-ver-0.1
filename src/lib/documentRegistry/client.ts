import { supabase } from '@/integrations/supabase/client';
import { captureCustomJournalScope, customJournalScopeCurrent, type CustomJournalScope } from '@/lib/customJournals/client';
import { journalUuid } from '@/lib/customJournals/contract';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import * as c from './contract';
import { DocumentRegistryError, normalizeRegistryError } from './errors';
export { DocumentRegistryError, normalizeRegistryError, registryMessages } from './errors';

export interface DocumentRegistryScope extends CustomJournalScope { registryScope: c.RegistryScope }
export function captureDocumentRegistryScope(organizationId: string, registryScope: c.RegistryScope, current: () => boolean): DocumentRegistryScope {
  const parsed = c.registryScopeSchema.safeParse(structuredClone(registryScope));
  if (!parsed.success) throw new DocumentRegistryError('ACCESS_DENIED');
  try { return { ...captureCustomJournalScope(organizationId, current), registryScope: Object.freeze(parsed.data as c.RegistryScope) }; } catch { throw new DocumentRegistryError('ACCESS_DENIED'); }
}
export const registryScopeCurrent = (scope: DocumentRegistryScope) => customJournalScopeCurrent(scope);
export function requireRegistryScope(scope: DocumentRegistryScope) { if (!registryScopeCurrent(scope)) throw new DocumentRegistryError('ACCESS_DENIED'); }
export async function requireRegistrySession(scope: DocumentRegistryScope) {
  requireRegistryScope(scope); const { data, error } = await supabase.auth.getSession(); requireRegistryScope(scope);
  if (error || data.session?.user.id !== scope.actorId || !data.session.access_token) throw new DocumentRegistryError('ACCESS_DENIED');
  return data.session.access_token;
}
async function call(scope: DocumentRegistryScope, name: string, args: Record<string, unknown>) {
  const token = await requireRegistrySession(scope);
  const result = await supabase.rpc(name as never, args as never).setHeader('Authorization', 'Bearer ' + token);
  requireRegistryScope(scope);
  if (result.status === 401 || result.status === 403) throw new DocumentRegistryError('ACCESS_DENIED');
  if (result.error) throw normalizeRegistryError(result.error);
  const error = c.registryErrorSchema.safeParse(result.data); if (error.success) throw new DocumentRegistryError(error.data.code);
  return result.data;
}
function envelope(scope: DocumentRegistryScope, value: { organization_id: string; scope: c.RegistryScope; capabilities: c.RegistryCapabilities }) {
  if (value.organization_id !== scope.organizationId || !c.sameRegistryScope(value.scope, scope.registryScope)) throw new DocumentRegistryError();
}
function ordered<T>(rows: T[], id: (row: T) => string, after: string | null, next: string | null) {
  let previous = after;
  for (const row of rows) { const current = id(row); if (previous !== null && current <= previous) throw new DocumentRegistryError(); previous = current; }
  if (next !== null && (!rows.length || next !== previous || next === after)) throw new DocumentRegistryError();
}
function recordContext(scope: DocumentRegistryScope, rows: c.RegistryRecord[]) {
  for (const row of rows) {
    if (!c.registryBindingMatches(row.data, row.context_binding, scope.organizationId) || row.data.source.kind === 'frdo_packet_artifact' && row.can_correct) throw new DocumentRegistryError();
  }
}
export async function readDocumentRegistry(scope: DocumentRegistryScope, query: c.RegistryQuery): Promise<c.RegistryRead> {
  const input = c.registryQuerySchema.safeParse(structuredClone(query));
  if (!input.success) throw new DocumentRegistryError('INVALID_INPUT');
  const q = input.data as c.RegistryQuery;
  if (q.kind === 'contexts' && (q.context_kind === 'enrollment_contract' ? !q.enrollment_id : q.enrollment_id !== null)) throw new DocumentRegistryError('INVALID_INPUT');
  const parsed = c.registryReadSchema.safeParse(await call(scope, 'read_document_registry', { p_org: scope.organizationId, p_scope: scope.registryScope, p_query: q }));
  if (!parsed.success) throw new DocumentRegistryError();
  const result = parsed.data as c.RegistryRead; envelope(scope, result);
  if (result.kind !== q.kind) throw new DocumentRegistryError();
  const caps = result.capabilities;
  const permitted = q.kind === 'incoming' ? caps.can_read_incoming || caps.can_capture_incoming
    : q.kind === 'incoming_file' ? caps.can_read_incoming && caps.can_open_file
    : q.kind === 'source' ? caps.can_open_file || caps.can_capture_source
    : q.kind === 'sources' ? caps.can_open_file
    : q.kind === 'legacy_issuance' ? caps.can_read_legacy
    : q.kind === 'validate_incoming' ? caps.can_register_incoming
    : q.kind === 'validate' ? caps.can_register || caps.can_correct
    : q.kind === 'file' ? caps.can_read && caps.can_open_file : caps.can_read;
  if (!permitted || result.kind === 'incoming' && !caps.can_read_incoming && (result.incoming.length || result.next_after_id !== null)) throw new DocumentRegistryError();
  if ('limit' in q) { const rows = result.kind === 'list' ? result.records : result.kind === 'history' ? result.history : result.kind === 'sources' ? result.sources : result.kind === 'parties' ? result.parties : result.kind === 'contexts' ? result.contexts : result.kind === 'legacy_issuance' ? result.legacy_records : result.kind === 'incoming' ? result.incoming : null; if (!rows || rows.length > q.limit) throw new DocumentRegistryError(); }
  if (result.kind === 'list' && q.kind === 'list') {
    recordContext(scope, result.records);
    if (new Set(result.records.map(row => row.id)).size !== result.records.length || result.records.length > result.counts.total || result.counts.incoming + result.counts.outgoing !== result.counts.total
      || result.counts.contracts + result.counts.orders > result.counts.total || result.next_cursor !== null && (!result.records.length || result.next_cursor === q.after)) throw new DocumentRegistryError();
  }
  if (result.kind === 'detail' && q.kind === 'detail') { if (result.record.id !== q.record_id) throw new DocumentRegistryError(); recordContext(scope, [result.record]); }
  if (result.kind === 'history' && q.kind === 'history') {
    let previous = q.after_revision;
    for (const row of result.history) { if (row.record_id !== q.record_id || row.revision !== previous + 1 || !c.registryBindingMatches(row.snapshot.data, row.snapshot.context_binding, scope.organizationId)) throw new DocumentRegistryError(); previous = row.revision; }
    if (result.next_after_revision !== null && (!result.history.length || result.next_after_revision !== previous)) throw new DocumentRegistryError();
  }
  if (result.kind === 'sources' && q.kind === 'sources') ordered(result.sources, row => row.source.version_id, q.after_id, result.next_after_id);
  if (result.kind === 'source' && q.kind === 'source' && (result.source.source.document_id !== q.document_id || result.source.source.version_id !== q.version_id)) throw new DocumentRegistryError();
  if (result.kind === 'parties' && q.kind === 'parties') {
    if (result.parties.some(row => row.party.kind !== q.party_kind)) throw new DocumentRegistryError();
    ordered(result.parties, row => row.party.kind === 'student' ? row.party.user_id : row.party.company_id, q.after_id, result.next_after_id);
  }
  if (result.kind === 'contexts' && q.kind === 'contexts') {
    if (result.contexts.some(row => row.context.kind !== q.context_kind || q.subject.kind === 'student' && row.student_id !== q.subject.user_id || q.context_kind === 'enrollment_contract' && row.context.kind === 'enrollment_contract' && row.context.enrollment_id !== q.enrollment_id)) throw new DocumentRegistryError();
    ordered(result.contexts, row => row.context.kind === 'enrollment' ? row.context.enrollment_id : row.context.contract_id, q.after_id, result.next_after_id);
  }
  if (result.kind === 'legacy_issuance' && q.kind === 'legacy_issuance') {
    if (!result.capabilities.can_read_legacy || result.legacy_records.some(row => row.id !== row.claim.id || row.enrollment_id !== row.claim.enrollment_id || row.student && !row.relationship_verified || row.file_state === 'missing' && row.claim.file_url_present)) throw new DocumentRegistryError();
    ordered(result.legacy_records, row => row.id, q.after_id, result.next_after_id);
  }
  if (result.kind === 'incoming' && q.kind === 'incoming') ordered(result.incoming, row => row.id, q.after_id, result.next_after_id);
  if (result.kind === 'validate' && q.kind === 'validate' || result.kind === 'validate_incoming' && q.kind === 'validate_incoming') {
    const value = result.validation, context = value.data.context;
    if (!sameCopyValue(value.data, q.data) || value.context_binding.organization_id !== scope.organizationId || value.context_binding.kind !== context.kind
      || (context.kind === 'enrollment' || context.kind === 'enrollment_contract') && value.context_binding.enrollment_id !== context.enrollment_id
      || (context.kind === 'contract' || context.kind === 'enrollment_contract') && value.context_binding.contract_id !== context.contract_id) throw new DocumentRegistryError();
  }
  if (result.kind === 'file' && result.file.kind !== 'org_document_version' && result.file.kind !== 'frdo_packet_artifact') throw new DocumentRegistryError();
  if (result.kind === 'incoming_file' && result.file.kind === 'frdo_packet_artifact') throw new DocumentRegistryError();
  if (result.kind === 'incoming_file' && q.kind === 'incoming_file' && result.file.kind === 'legacy_incoming_object' && result.file.incoming_document_id !== q.incoming_document_id) throw new DocumentRegistryError();
  if ((result.kind === 'file' || result.kind === 'incoming_file') && !result.file.path.startsWith(scope.organizationId + '/')) throw new DocumentRegistryError();
  requireRegistryScope(scope); return result;
}
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
export function prepareDocumentRegistryMutation(scope: DocumentRegistryScope, expectedRevision: number, action: c.RegistryAction, requestId: string = crypto.randomUUID()) {
  requireRegistryScope(scope);
  const parsed = c.registryActionSchema.safeParse(structuredClone(action));
  if (!parsed.success || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !journalUuid.safeParse(requestId).success) throw new DocumentRegistryError('INVALID_INPUT');
  const saved = freeze(parsed.data as c.RegistryAction);
  if ((saved.action === 'register' || saved.action === 'register_incoming' || saved.action === 'capture_incoming') && expectedRevision !== 0 || (saved.action === 'correct' || saved.action === 'archive') && expectedRevision === 0) throw new DocumentRegistryError('INVALID_INPUT');
  const args = freeze({ p_org: scope.organizationId, p_scope: scope.registryScope, p_expected_revision: expectedRevision, p_request_id: requestId, p_action: saved });
  return { requestId, action: saved, expectedRevision, run: async (): Promise<c.RegistryMutation> => {
    const resultParse = c.registryMutationSchema.safeParse(await call(scope, 'apply_document_registry_action', args));
    if (!resultParse.success) throw new DocumentRegistryError();
    const result = resultParse.data as c.RegistryMutation; envelope(scope, result);
    if (result.kind !== saved.action || result.request_id !== requestId) throw new DocumentRegistryError();
    if (result.kind === 'capture_incoming' && saved.action === 'capture_incoming') {
      if (!result.capabilities.can_capture_incoming || result.incoming.registry_record_id !== null || !sameCopyValue(result.incoming.linked_source, saved.data.source) || result.incoming.doc_type !== saved.data.doc_type || result.incoming.title !== saved.data.title || result.incoming.doc_number !== saved.data.doc_number || result.incoming.doc_date !== saved.data.doc_date) throw new DocumentRegistryError();
      requireRegistryScope(scope); return result;
    }
    if (!('record' in result) || saved.action === 'capture_incoming') throw new DocumentRegistryError();
    recordContext(scope, [result.record]);
    if (result.kind !== saved.action || result.request_id !== requestId || 'record_id' in saved && result.record.id !== saved.record_id) throw new DocumentRegistryError();
    const appliedRevision = saved.action === 'register' || saved.action === 'register_incoming' ? 1 : expectedRevision + 1;
    if (result.record.revision < appliedRevision || !result.replayed && result.record.revision !== appliedRevision) throw new DocumentRegistryError();
    if (result.record.revision === appliedRevision) {
      if (saved.action === 'register' || saved.action === 'correct') if (!sameCopyValue(result.record.data, saved.data)) throw new DocumentRegistryError();
      if (saved.action === 'register_incoming') {
        const { origin, ...data } = result.record.data;
        if (origin.kind !== 'incoming_document' || !sameCopyValue(data, saved.data) || saved.incoming.kind === 'existing' && origin.incoming_document_id !== saved.incoming.incoming_document_id) throw new DocumentRegistryError();
      }
      if (saved.action === 'archive' && result.record.status !== 'archived') throw new DocumentRegistryError();
    }
    requireRegistryScope(scope); return result;
  } };
}
