import { supabase } from '@/integrations/supabase/client';
import { captureCustomJournalScope, customJournalScopeCurrent, type CustomJournalScope } from '@/lib/customJournals/client';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import * as c from './contract';

export const chainMessages: Record<c.ChainErrorCode, string> = {
  ACCESS_DENIED: 'Доступ к документам этого ученика не подтверждён.',
  INVALID_INPUT: 'Проверьте выбранное обучение и документ.',
  NOT_FOUND: 'Документ не найден в выбранном обучении.',
  SOURCE_CHANGED: 'Версия документа изменилась. Обновите сведения.',
  DEPENDENCY_UNAVAILABLE: 'Не удалось подтвердить документы. Повторите загрузку.',
};
export class DocumentChainError extends Error {
  constructor(readonly code: c.ChainErrorCode = 'DEPENDENCY_UNAVAILABLE', publicReason?: string) { super(publicReason || chainMessages[code]); this.name = 'DocumentChainError'; }
}
export function normalizeChainError(error: unknown): DocumentChainError {
  if (error instanceof DocumentChainError) return error;
  const value = error as { code?: unknown; status?: number; message?: unknown } | null;
  if (value?.code === '42501' || value?.status === 401 || value?.status === 403) return new DocumentChainError('ACCESS_DENIED');
  if (value?.code === '22023') return new DocumentChainError('INVALID_INPUT');
  const candidate = typeof value?.message === 'string' ? value.message.match(/UC_DOCUMENT_CHAIN_(ACCESS_DENIED|INVALID_INPUT|NOT_FOUND|SOURCE_CHANGED|DEPENDENCY_UNAVAILABLE)(?:\b|$)/)?.[1] : value?.code;
  const parsed = c.chainErrorCodeSchema.safeParse(candidate);
  return new DocumentChainError(parsed.success ? parsed.data : 'DEPENDENCY_UNAVAILABLE');
}
export interface DocumentChainScope extends CustomJournalScope { target: c.ChainScope; signal?: AbortSignal; expectedViewer?: 'self' }
export function captureDocumentChainScope(organizationId: string, target: c.ChainScope, current: () => boolean = () => true, signal?: AbortSignal): DocumentChainScope {
  const parsed = c.chainScopeSchema.safeParse(structuredClone(target));
  if (!parsed.success) throw new DocumentChainError('INVALID_INPUT');
  try { return { ...captureCustomJournalScope(organizationId, current), target: Object.freeze(parsed.data as c.ChainScope), signal }; }
  catch { throw new DocumentChainError('ACCESS_DENIED'); }
}
export const documentChainScopeCurrent = (scope: DocumentChainScope) => !scope.signal?.aborted && customJournalScopeCurrent(scope);
export function requireDocumentChainScope(scope: DocumentChainScope) { if (!documentChainScopeCurrent(scope)) throw new DocumentChainError('ACCESS_DENIED'); }

function rowMatches(scope: DocumentChainScope, row: c.ChainRow) {
  const target = scope.target;
  if (target.kind === 'student' && (row.student_user_id !== target.student_user_id || target.enrollment_id !== null && row.enrollment_id !== target.enrollment_id || target.group_id !== null && row.group_id !== target.group_id)
    || target.kind === 'group' && row.group_id !== target.group_id) throw new DocumentChainError('SOURCE_CHANGED');
  const slots = [row.admission_order, row.completion_order, row.education_document];
  if (slots[0].kind !== 'admission_order' || slots[1].kind !== 'completion_order' || slots[2].kind !== 'education_document') throw new DocumentChainError();
  for (const slot of slots) {
    if (slot.capabilities.can_open && !slot.source || slot.state === 'unavailable' && !slot.why) throw new DocumentChainError();
    const source = slot.source;
    if (source && (source.kind === 'admission_draft' || source.kind === 'education_record') && source.enrollment_id !== row.enrollment_id) throw new DocumentChainError('SOURCE_CHANGED');
    if (source?.kind === 'admission_draft' && source.group_id !== row.group_id) throw new DocumentChainError('SOURCE_CHANGED');
    const action = slot.next_action;
    if (!action) continue;
    if (action.kind === 'open_source' && (!slot.capabilities.can_open || !sameCopyValue(action.source, slot.source))) throw new DocumentChainError('SOURCE_CHANGED');
    if ('enrollment_id' in action && action.enrollment_id !== row.enrollment_id || 'group_id' in action && action.group_id !== row.group_id || action.kind === 'review_issuance' && action.course_id !== row.course_id) throw new DocumentChainError('SOURCE_CHANGED');
    if (action.kind !== 'open_source' && !slot.capabilities.can_continue) throw new DocumentChainError();
  }
}
function validateSource(scope: DocumentChainScope, query: Extract<c.ChainQuery, { kind: 'source' }>, value: c.ChainSourceRead) {
  const context = value.context, target = value.target, ref = query.source;
  if (!sameCopyValue(value.source, ref) || context.organization_id !== scope.organizationId || context.enrollment_id !== query.enrollment_id || context.group_id !== query.group_id
    || scope.target.kind === 'student' && (context.student_user_id !== scope.target.student_user_id || scope.target.enrollment_id !== null && context.enrollment_id !== scope.target.enrollment_id || scope.target.group_id !== null && context.group_id !== scope.target.group_id)
    || scope.target.kind === 'group' && context.group_id !== scope.target.group_id) throw new DocumentChainError('SOURCE_CHANGED');
  if (value.availability === 'unavailable') { if (target !== null || !value.why) throw new DocumentChainError(); return; }
  if (!value.capabilities.can_open_sources || !target || target.kind !== ref.kind) throw new DocumentChainError('ACCESS_DENIED');
  // An own-only overview must never turn into a broad registry/group-file read.
  if (value.viewer === 'self') throw new DocumentChainError('ACCESS_DENIED');
  if (ref.kind === 'admission_draft' && target.kind === 'admission_draft' && (target.draft.id !== ref.id || target.draft.revision !== ref.revision || target.enrollment_id !== context.enrollment_id || target.group_id !== context.group_id
    || target.draft.organization_id !== scope.organizationId || target.draft.user_id !== context.student_user_id || target.draft.course_id !== context.course_id || target.draft.enrollment_id !== context.enrollment_id || target.draft.group_id !== context.group_id)) throw new DocumentChainError('SOURCE_CHANGED');
  if (ref.kind === 'registry_record' && target.kind === 'registry_record' && (target.record_id !== ref.id || target.revision !== ref.revision)) throw new DocumentChainError('SOURCE_CHANGED');
  if (ref.kind === 'education_record' && target.kind === 'education_record' && (target.record_id !== ref.id || target.revision !== ref.revision || target.enrollment_id !== context.enrollment_id)) throw new DocumentChainError('SOURCE_CHANGED');
  if (ref.kind === 'org_document_version' && target.kind === 'org_document_version' && !sameCopyValue(target, ref)) throw new DocumentChainError('SOURCE_CHANGED');
}
export async function readDocumentChain(scope: DocumentChainScope, input: c.ChainQuery): Promise<c.ChainRead> {
  requireDocumentChainScope(scope);
  const parsedInput = c.chainQuerySchema.safeParse(structuredClone(input));
  if (!parsedInput.success) throw new DocumentChainError('INVALID_INPUT');
  const query = parsedInput.data as c.ChainQuery;
  const session = await supabase.auth.getSession(); requireDocumentChainScope(scope);
  if (session.error || session.data.session?.user.id !== scope.actorId || !session.data.session.access_token) throw new DocumentChainError('ACCESS_DENIED');
  const pending = supabase.rpc('uc_read_document_chain' as never, { p_organization_id: scope.organizationId, p_scope: scope.target, p_query: query } as never)
    .setHeader('Authorization', 'Bearer ' + session.data.session.access_token);
  const result = await (scope.signal ? pending.abortSignal(scope.signal) : pending);
  requireDocumentChainScope(scope);
  if (result.status === 401 || result.status === 403) throw new DocumentChainError('ACCESS_DENIED');
  if (result.error) throw normalizeChainError(result.error);
  const failure = result.data as { error?: { code?: unknown } } | null;
  if (failure?.error) throw normalizeChainError(failure.error);
  const parsed = c.chainReadSchema.safeParse(result.data);
  if (!parsed.success) throw new DocumentChainError();
  const value = parsed.data as c.ChainRead;
  if (value.kind !== query.kind || value.organization_id !== scope.organizationId || !sameCopyValue(value.scope, scope.target) || !value.capabilities.can_read) throw new DocumentChainError('ACCESS_DENIED');
  if (scope.expectedViewer && value.viewer !== scope.expectedViewer) throw new DocumentChainError('ACCESS_DENIED');
  if (value.viewer === 'self' && (scope.target.kind !== 'student' || scope.target.student_user_id !== scope.actorId)) throw new DocumentChainError('ACCESS_DENIED');
  if (value.kind === 'list' && query.kind === 'list') {
    if (value.rows.length > query.limit || value.total_count !== null && value.total_count < value.rows.length || value.availability === 'unavailable' && (value.rows.length || value.total_count !== null || value.next_after_enrollment_id !== null || !value.why)) throw new DocumentChainError();
    let previous = query.after_enrollment_id;
    for (const row of value.rows) { if (previous !== null && row.enrollment_id <= previous) throw new DocumentChainError(); previous = row.enrollment_id; rowMatches(scope, row); }
    if (value.next_after_enrollment_id !== null && (!value.rows.length || value.next_after_enrollment_id !== previous)) throw new DocumentChainError();
  }
  if (value.kind === 'detail' && query.kind === 'detail') {
    if (value.availability === 'available' && (!value.row || value.row.enrollment_id !== query.enrollment_id || query.group_id !== null && value.row.group_id !== query.group_id) || value.availability === 'unavailable' && (value.row !== null || !value.why)) throw new DocumentChainError('SOURCE_CHANGED');
    if (value.row) rowMatches(scope, value.row);
  }
  if (value.kind === 'source' && query.kind === 'source') validateSource(scope, query, value);
  if (value.kind === 'journal_source' && query.kind === 'journal_source') {
    if (value.context.organization_id !== scope.organizationId || value.context.enrollment_id !== query.enrollment_id || value.context.group_id !== query.group_id
      || scope.target.kind === 'student' && (value.context.student_user_id !== scope.target.student_user_id || scope.target.enrollment_id !== null && value.context.enrollment_id !== scope.target.enrollment_id || scope.target.group_id !== null && value.context.group_id !== scope.target.group_id)
      || scope.target.kind === 'group' && value.context.group_id !== scope.target.group_id) throw new DocumentChainError('SOURCE_CHANGED');
    if (value.availability === 'unavailable') {
      if (value.target !== null || !value.why) throw new DocumentChainError();
    } else {
      if (!value.source || !value.context.enrollment_id || !value.context.student_user_id || !value.context.course_id) throw new DocumentChainError();
      const id = value.source.kind === 'org_document_version' ? value.source.document_id : value.source.id;
      const rev = value.source.kind === 'org_document_version' ? null : value.source.revision;
      if (id !== query.source_id || rev !== query.source_revision) throw new DocumentChainError('SOURCE_CHANGED');
      validateSource(scope, { kind: 'source', enrollment_id: value.context.enrollment_id, group_id: query.group_id, source: value.source },
        { ...value, kind: 'source', context: { ...value.context, student_user_id: value.context.student_user_id, enrollment_id: value.context.enrollment_id, course_id: value.context.course_id }, source: value.source });
    }
  }
  requireDocumentChainScope(scope); return value;
}
