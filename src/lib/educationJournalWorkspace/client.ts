import { supabase } from '@/integrations/supabase/client';
import { captureCustomJournalScope, customJournalScopeCurrent, type CustomJournalScope } from '@/lib/customJournals/client';
import * as c from './contract';

export class EducationJournalError extends Error {
  constructor(readonly code: c.EducationJournalErrorCode = 'DEPENDENCY_UNAVAILABLE') { super(code); this.name = 'EducationJournalError'; }
}
export const educationJournalMessages: Record<c.EducationJournalErrorCode, string> = {
  ACCESS_DENIED: 'Доступ к этим записям не подтверждён.', INVALID_INPUT: 'Проверьте выбранного ученика, обучение и журнал.',
  SOURCE_CHANGED: 'Данные изменились во время подготовки. Обновите записи и подготовьте выписку ещё раз.',
  NOT_FOUND: 'Ученик, обучение или журнал не найдены в этой организации.',
  DEPENDENCY_UNAVAILABLE: 'Не удалось подтвердить записи. Повторите загрузку.',
  LIMIT_EXCEEDED: 'Выписка слишком велика для одного файла. Уточните обучение; неполный файл не создаётся.',
};
export interface EducationJournalRequestScope extends CustomJournalScope { target: c.EducationJournalScope }
export function captureEducationJournalScope(organizationId: string, target: c.EducationJournalScope, current?: () => boolean): EducationJournalRequestScope {
  const parsed = c.journalScopeSchema.safeParse(target);
  if (!parsed.success) throw new EducationJournalError('INVALID_INPUT');
  try { return { ...captureCustomJournalScope(organizationId, current), target: parsed.data }; }
  catch { throw new EducationJournalError('ACCESS_DENIED'); }
}
export function requireEducationJournalScope(scope: EducationJournalRequestScope) {
  if (!customJournalScopeCurrent(scope)) throw new EducationJournalError('ACCESS_DENIED');
}
export function normalizeEducationJournalError(error: unknown): EducationJournalError {
  if (error instanceof EducationJournalError) return error;
  const value = error as { code?: unknown; message?: unknown; status?: number } | null;
  if (value?.code === '42501' || value?.status === 401 || value?.status === 403) return new EducationJournalError('ACCESS_DENIED');
  const candidate = typeof value?.message === 'string'
    ? value.message.match(/UC_EDUCATION_JOURNAL_(ACCESS_DENIED|INVALID_INPUT|SOURCE_CHANGED|NOT_FOUND|DEPENDENCY_UNAVAILABLE|LIMIT_EXCEEDED)(?:\b|$)/)?.[1] : value?.code;
  const code = c.journalErrorCode.safeParse(candidate);
  return new EducationJournalError(code.success ? code.data : value?.code === '22023' ? 'INVALID_INPUT' : 'DEPENDENCY_UNAVAILABLE');
}
function validateContext(scope: EducationJournalRequestScope, value: c.EducationJournalRead) {
  if (value.organization_id !== scope.organizationId || value.context.organization.id !== scope.organizationId
    || !c.sameScope(scope.target, value.scope) || !value.capabilities.can_read) throw new EducationJournalError('ACCESS_DENIED');
  const target = scope.target;
  if (target.kind === 'student' && (value.context.student?.user_id !== target.student_user_id
    || target.enrollment_id !== null && value.context.enrollment?.id !== target.enrollment_id
    || target.group_id !== null && value.context.group?.id !== target.group_id)) throw new EducationJournalError();
  if (target.kind === 'group' && value.context.group?.id !== target.group_id) throw new EducationJournalError();
}
export async function readEducationJournalWorkspace(scope: EducationJournalRequestScope, query: c.EducationJournalQuery): Promise<c.EducationJournalRead> {
  requireEducationJournalScope(scope);
  const parsedQuery = c.journalQuerySchema.safeParse(query);
  if (!parsedQuery.success) throw new EducationJournalError('INVALID_INPUT');
  const q = parsedQuery.data;
  try {
    const session = await supabase.auth.getSession();
    requireEducationJournalScope(scope);
    if (session.error || session.data.session?.user.id !== scope.actorId || !session.data.session?.access_token) throw new EducationJournalError('ACCESS_DENIED');
    const rpc = supabase.rpc.bind(supabase) as unknown as (name: string, args: Record<string, unknown>) => { setHeader(name: string, value: string): PromiseLike<{ data: unknown; error: unknown; status?: number }> };
    const result = await rpc('uc_read_education_journal_workspace', { p_organization_id: scope.organizationId, p_scope: scope.target, p_query: q })
      .setHeader('Authorization', 'Bearer ' + session.data.session.access_token);
    requireEducationJournalScope(scope);
    if (result.error) throw normalizeEducationJournalError(result.error);
    if (result.status === 401 || result.status === 403) throw new EducationJournalError('ACCESS_DENIED');
    const failure = result.data as { error?: { code?: unknown } } | null;
    if (failure?.error) throw normalizeEducationJournalError(failure.error);
    const parsed = c.journalReadSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.kind !== q.kind) throw new EducationJournalError();
    const value = parsed.data;
    validateContext(scope, value);
    if (value.kind === 'summary') {
      if (new Set(value.journals.map(row => row.journal_type)).size !== value.journals.length) throw new EducationJournalError();
    } else if (q.kind === 'rows') {
      if (value.journal_type !== q.journal_type || value.rows.length > q.limit || value.total_count < value.rows.length
        || q.snapshot_key !== null && value.snapshot_key !== q.snapshot_key) throw new EducationJournalError('SOURCE_CHANGED');
      if (new Set(value.rows.map(row => row.id)).size !== value.rows.length
        || value.next_cursor !== null && (!value.rows.length || value.next_cursor === q.after)) throw new EducationJournalError();
      for (const row of value.rows) {
        if (row.journal_type !== q.journal_type) throw new EducationJournalError();
        // Legacy digital activity has no historical group witness. The exact
        // requested group remains validated in context; a different real group
        // is never accepted. Controlled journals still require an exact binding.
        const unboundDigitalGroup = row.group_id === null && (q.journal_type === 'activity' || q.journal_type === 'current_control');
        if (scope.target.kind === 'student' && (row.student_user_id !== scope.target.student_user_id
          || scope.target.enrollment_id !== null && row.enrollment_id !== scope.target.enrollment_id
          || scope.target.group_id !== null && row.group_id !== scope.target.group_id && !unboundDigitalGroup)) throw new EducationJournalError('ACCESS_DENIED');
        if (scope.target.kind === 'group' && row.group_id !== scope.target.group_id && !unboundDigitalGroup) throw new EducationJournalError('ACCESS_DENIED');
      }
    }
    requireEducationJournalScope(scope);
    return value;
  } catch (error) { throw normalizeEducationJournalError(error); }
}
