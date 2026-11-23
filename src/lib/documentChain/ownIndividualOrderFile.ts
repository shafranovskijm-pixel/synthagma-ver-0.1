import { supabase } from '@/integrations/supabase/client';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { chainOwnIndividualOrderTargetSchema, type ChainQuery, type ChainSourceRead, type ChainJournalSourceRead } from './contract';
import { DocumentChainError, readDocumentChain, requireDocumentChainScope, type DocumentChainScope } from './client';

/** Own-only W1 PDF route. No generic organization storage reader or staff registry access. */
export async function loadOwnIndividualOrderPdf(scope: DocumentChainScope, query: Extract<ChainQuery, { kind: 'source' | 'journal_source' }>, initial: ChainSourceRead | ChainJournalSourceRead): Promise<Blob> {
  requireDocumentChainScope(scope);
  const parsed = chainOwnIndividualOrderTargetSchema.safeParse(initial.target);
  if (!parsed.success || initial.availability !== 'available' || initial.viewer !== 'self' || initial.source?.kind !== 'registry_record' || scope.target.kind !== 'student' || scope.target.student_user_id !== scope.actorId || initial.context.student_user_id !== scope.actorId || initial.context.organization_id !== scope.organizationId || !initial.context.enrollment_id || !initial.context.course_id || !initial.capabilities.can_open_sources) throw new DocumentChainError('ACCESS_DENIED');
  const target = parsed.data, source = initial.source, context = initial.context;
  if (target.registry_record_id !== source.id || target.registry_record_revision !== source.revision || target.document_id !== source.document_id || target.version_id !== source.version_id || query.enrollment_id !== context.enrollment_id || query.group_id !== context.group_id || query.kind === 'source' && !sameCopyValue(query.source, source) || query.kind === 'journal_source' && (query.source_id !== source.id || query.source_revision !== source.revision) || scope.target.enrollment_id !== null && scope.target.enrollment_id !== context.enrollment_id || scope.target.group_id !== null && scope.target.group_id !== context.group_id) throw new DocumentChainError('SOURCE_CHANGED');
  const session = async () => { const value = await supabase.auth.getSession(); requireDocumentChainScope(scope); if (value.error || value.data.session?.user.id !== scope.actorId || !value.data.session.access_token) throw new DocumentChainError('ACCESS_DENIED'); const user = await supabase.auth.getUser(value.data.session.access_token); requireDocumentChainScope(scope); if (user.error || user.data.user?.id !== scope.actorId) throw new DocumentChainError('ACCESS_DENIED'); return value.data.session.access_token; };
  const token = await session();
  let base: URL; try { base = new URL(import.meta.env.VITE_SUPABASE_URL); } catch { throw new DocumentChainError(); } if (base.protocol !== 'https:') throw new DocumentChainError();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null; const controller = new AbortController(), abort = () => { controller.abort(); if (reader) void reader.cancel().catch(() => {}); }, timer = setTimeout(abort, 60000);
  scope.signal?.addEventListener('abort', abort, { once: true }); if (scope.signal?.aborted) controller.abort();
  const check = () => { requireDocumentChainScope(scope); if (controller.signal.aborted) throw new DocumentChainError(); };
  try {
    check(); const response = await window.fetch(base.origin + base.pathname.replace(/\/$/, '') + '/functions/v1/individual-education-order-file', { method: 'POST', headers: { Authorization: 'Bearer ' + token, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, organization_id: scope.organizationId, enrollment_id: context.enrollment_id, registry_record_id: target.registry_record_id, registry_record_revision: target.registry_record_revision }), signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' }); check();
    if (response.status === 401 || response.status === 403) throw new DocumentChainError('ACCESS_DENIED');
    if (response.status === 404) throw new DocumentChainError('NOT_FOUND'); if (response.status === 409) throw new DocumentChainError('SOURCE_CHANGED');
    if (!response.ok || response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf' || !response.body) throw new DocumentChainError();
    const length = response.headers.get('content-length'); if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) !== target.byte_size)) throw new DocumentChainError('SOURCE_CHANGED');
    reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const next = await reader.read(); check(); if (next.done) break; size += next.value.byteLength; if (size > target.byte_size || size > 20971520) throw new DocumentChainError('SOURCE_CHANGED'); chunks.push(new Uint8Array(next.value)); }
    if (size !== target.byte_size) throw new DocumentChainError('SOURCE_CHANGED'); const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new DocumentChainError('SOURCE_CHANGED');
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer)), value => value.toString(16).padStart(2, '0')).join(''); check(); if (sha !== target.byte_sha256) throw new DocumentChainError('SOURCE_CHANGED');
    await session(); check(); const fresh = await readDocumentChain(scope, query); check();
    if ((fresh.kind !== 'source' && fresh.kind !== 'journal_source') || fresh.availability !== 'available' || fresh.viewer !== 'self' || !fresh.capabilities.can_read || !fresh.capabilities.can_open_sources || !sameCopyValue(fresh.source, source) || !sameCopyValue(fresh.context, context) || !sameCopyValue(fresh.target, target)) throw new DocumentChainError('SOURCE_CHANGED');
    return new Blob([bytes.slice().buffer], { type: 'application/pdf' });
  } catch (error) { if (error instanceof DocumentChainError) throw error; requireDocumentChainScope(scope); throw new DocumentChainError(); }
  finally { clearTimeout(timer); scope.signal?.removeEventListener('abort', abort); controller.abort(); if (reader) { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch { /* Pending cancellation releases its read. */ } } }
}
