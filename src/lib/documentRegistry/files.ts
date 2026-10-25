import { supabase } from '@/integrations/supabase/client';
import { createDocumentUploadOperation, saveDocumentUpload, type DocumentUploadOperation, type OrgDocumentClient } from '@/lib/orgDocumentLifecycle';
import { requireRegistryScope, requireRegistrySession, type DocumentRegistryScope } from './client.ts';
import { DocumentRegistryError } from './errors.ts';
import type { RegistryFile, RegistryReadSource } from './contract.ts';

/** Keep the same operation after transport uncertainty; committed/staged bytes are never cleaned up here. */
export function prepareRegistrySourceUpload(organizationId: string, file: File, title: string) {
  return createDocumentUploadOperation({ organizationId, file, document: { name: title.trim() || file.name, type: 'other', status: 'active' }, changeSummary: 'Сохранён исходный файл для регистрации. Регистрация, подпись и выдача выполняются отдельно.' });
}
export async function uploadRegistrySource(scope: DocumentRegistryScope, operation: DocumentUploadOperation) {
  if (operation.organizationId !== scope.organizationId) throw new DocumentRegistryError('ACCESS_DENIED');
  const client: OrgDocumentClient = {
    storage: { from: bucket => ({
      upload: async (path, file, options) => { await requireRegistrySession(scope); const result = await supabase.storage.from(bucket).upload(path, file, options); requireRegistryScope(scope); return result; },
      getPublicUrl: path => { requireRegistryScope(scope); return supabase.storage.from(bucket).getPublicUrl(path); },
    }) },
    rpc: async (name, args) => { const token = await requireRegistrySession(scope); const result = await supabase.rpc(name as never, args as never).setHeader('Authorization', 'Bearer ' + token); requireRegistryScope(scope); return result; },
  };
  const result = await saveDocumentUpload(operation, client); requireRegistryScope(scope); return result;
}
export async function loadRegistryFile(scope: DocumentRegistryScope, descriptor: RegistryFile, expected?: RegistryReadSource) {
  requireRegistryScope(scope);
  if (descriptor.kind === 'frdo_packet_artifact') return loadFrdoRegistryFile(scope, descriptor, expected);
  if (!descriptor.path.startsWith(scope.organizationId + '/') || expected && (expected.kind !== 'org_document_version' || descriptor.kind !== 'org_document_version' || descriptor.version_id !== expected.version_id || descriptor.proof_hash !== expected.content_hash)) throw new DocumentRegistryError('SOURCE_CHANGED');
  await requireRegistrySession(scope);
  const { data, error } = await supabase.storage.from(descriptor.bucket).download(descriptor.path);
  requireRegistryScope(scope);
  if (error || !data || data.size !== descriptor.size) throw new DocumentRegistryError('SOURCE_UNAVAILABLE');
  return data;
}
async function loadFrdoRegistryFile(scope: DocumentRegistryScope, descriptor: Extract<RegistryFile, { kind: 'frdo_packet_artifact' }>, expected?: RegistryReadSource) {
  if (expected?.kind !== 'frdo_packet_artifact' || descriptor.artifact_id !== expected.artifact_id) throw new DocumentRegistryError('SOURCE_CHANGED');
  const parts = descriptor.path.split('/'), uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (parts.length !== 5 || parts[0] !== scope.organizationId || parts[1] !== 'packets' || parts[2] !== expected.packet_id || !uuid.test(parts[3]) || parts[4] !== expected.artifact_id + '.xlsx' || descriptor.size < 1 || descriptor.size > 20971520) throw new DocumentRegistryError('SOURCE_CHANGED');
  const token = await requireRegistrySession(scope), base = new URL(import.meta.env.VITE_SUPABASE_URL);
  if (base.protocol !== 'https:') throw new DocumentRegistryError('SOURCE_UNAVAILABLE');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000); let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  try {
    const response = await fetch(base.origin + base.pathname.replace(/\/$/, '') + '/storage/v1/object/frdo-packet-artifacts/' + parts.map(encodeURIComponent).join('/'), { headers: { Authorization: 'Bearer ' + token, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error' });
    requireRegistryScope(scope); if (response.status === 401 || response.status === 403) throw new DocumentRegistryError('ACCESS_DENIED');
    if (!response.ok || !response.body) throw new DocumentRegistryError('SOURCE_UNAVAILABLE');
    const length = response.headers.get('content-length'); if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) !== descriptor.size)) throw new DocumentRegistryError('SOURCE_CHANGED');
    reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const next = await reader.read(); requireRegistryScope(scope); if (next.done) break; size += next.value.byteLength; if (size > descriptor.size) throw new DocumentRegistryError('SOURCE_CHANGED'); chunks.push(new Uint8Array(next.value)); }
    if (size !== descriptor.size) throw new DocumentRegistryError('SOURCE_CHANGED');
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer)), b => b.toString(16).padStart(2, '0')).join('');
    requireRegistryScope(scope); if (hash !== descriptor.proof_hash) throw new DocumentRegistryError('SOURCE_CHANGED');
    return new Blob([bytes.slice().buffer as ArrayBuffer], { type: descriptor.mime });
  } finally { clearTimeout(timer); if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } controller.abort(); }
}
export function downloadRegistryBlob(blob: Blob, filename: string, current: () => boolean) {
  if (!current()) throw new DocumentRegistryError('ACCESS_DENIED');
  const url = URL.createObjectURL(blob); let link: HTMLAnchorElement | null = null, activated = false;
  try { if (!current()) throw new DocumentRegistryError('ACCESS_DENIED'); link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); activated = true; }
  finally { link?.remove(); if (activated) setTimeout(() => URL.revokeObjectURL(url), 1000); else URL.revokeObjectURL(url); }
}
export const registryFilePreviewable = (file: Pick<RegistryFile, 'mime'>) => /^(application\/pdf|image\/(png|jpeg|gif|webp))$/i.test(file.mime);
