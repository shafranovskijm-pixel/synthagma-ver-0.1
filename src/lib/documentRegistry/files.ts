import { supabase } from '@/integrations/supabase/client';
import { createDocumentUploadOperation, saveDocumentUpload, type DocumentUploadOperation, type OrgDocumentClient } from '@/lib/orgDocumentLifecycle';
import { requireRegistryScope, requireRegistrySession, type DocumentRegistryScope } from './client';
import { DocumentRegistryError } from './errors';
import type { RegistryFile, RegistrySource } from './contract';

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
export async function loadRegistryFile(scope: DocumentRegistryScope, descriptor: RegistryFile, expected?: RegistrySource) {
  requireRegistryScope(scope);
  if (!descriptor.path.startsWith(scope.organizationId + '/') || expected && (descriptor.kind !== 'org_document_version' || descriptor.version_id !== expected.version_id || descriptor.proof_hash !== expected.content_hash)) throw new DocumentRegistryError('SOURCE_CHANGED');
  await requireRegistrySession(scope);
  const { data, error } = await supabase.storage.from(descriptor.bucket).download(descriptor.path);
  requireRegistryScope(scope);
  if (error || !data || data.size !== descriptor.size) throw new DocumentRegistryError('SOURCE_UNAVAILABLE');
  return data;
}
export function downloadRegistryBlob(blob: Blob, filename: string, current: () => boolean) {
  if (!current()) throw new DocumentRegistryError('ACCESS_DENIED');
  const url = URL.createObjectURL(blob); let link: HTMLAnchorElement | null = null, activated = false;
  try { if (!current()) throw new DocumentRegistryError('ACCESS_DENIED'); link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); activated = true; }
  finally { link?.remove(); if (activated) setTimeout(() => URL.revokeObjectURL(url), 1000); else URL.revokeObjectURL(url); }
}
export const registryFilePreviewable = (file: RegistryFile) => /^(application\/pdf|image\/(png|jpeg|gif|webp))$/i.test(file.mime);
