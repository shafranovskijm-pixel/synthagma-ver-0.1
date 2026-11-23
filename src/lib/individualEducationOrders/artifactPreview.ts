import { supabase } from '@/integrations/supabase/client';
import { captureDocumentRegistryScope, readDocumentRegistry } from '@/lib/documentRegistry/client';
import { sameCopyValue } from '@/lib/copyRegistry/value';
import { IndividualOrderError, individualOrderScopeCurrent, readIndividualEducationOrder, type IndividualOrderScope } from './client';
import type { IndividualOrder } from './contract';

/** Protected, exact saved bytes only. Loading this file is not a staff review or registration. */
export async function loadIndividualOrderPdf(scope: IndividualOrderScope, expected: IndividualOrder): Promise<Blob> {
  const current = () => { if (!individualOrderScopeCurrent(scope)) throw new IndividualOrderError('ACCESS_DENIED'); };
  current();
  const checkOrder = async () => {
    const result = await readIndividualEducationOrder(scope, { version: 1, kind: 'order', order_id: expected.id }); current();
    if (result.kind !== 'order' || result.order.revision !== expected.revision || result.order.state_sha256 !== expected.state_sha256 || !result.order.artifact || !result.order.capabilities.can_open_source || !sameCopyValue(result.order.artifact, expected.artifact)) throw new IndividualOrderError('SOURCE_CHANGED');
    return result.order.artifact;
  };
  const artifact = await checkOrder();
  const registryScope = captureDocumentRegistryScope(scope.organizationId, { kind: 'organization' }, () => individualOrderScopeCurrent(scope));
  if (registryScope.actorId !== scope.actorId || registryScope.accessRevision !== scope.accessRevision) throw new IndividualOrderError('ACCESS_DENIED');
  const checkSource = async () => {
    const result = await readDocumentRegistry(registryScope, { kind: 'source', document_id: artifact.source.document_id, version_id: artifact.source.version_id }); current();
    if (result.kind !== 'source' || !sameCopyValue(result.source.source, artifact.source)) throw new IndividualOrderError('SOURCE_CHANGED');
  };
  await checkSource();
  const session = await supabase.auth.getSession(); current();
  if (session.error || session.data.session?.user.id !== scope.actorId || !session.data.session.access_token) throw new IndividualOrderError('ACCESS_DENIED');
  const readVersion = async () => {
    const result = await supabase.from('org_document_versions').select('id,document_id,organization_id,file_path,file_size,file_name')
      .eq('id', artifact.source.version_id).eq('document_id', artifact.source.document_id).eq('organization_id', scope.organizationId).single().setHeader('Authorization', 'Bearer ' + session.data.session!.access_token); current();
    const row = result.data;
    if (result.error || !row || row.id !== artifact.source.version_id || row.document_id !== artifact.source.document_id || row.organization_id !== scope.organizationId || row.file_size !== artifact.byte_size || !row.file_path?.startsWith(scope.organizationId + '/versions/' + artifact.source.document_id + '/') || /(?:\\|\.\.|[?\x00-\x1f])/.test(row.file_path)) throw new IndividualOrderError('SOURCE_UNAVAILABLE');
    return row;
  };
  const before = await readVersion();
  const response = await supabase.storage.from('org-documents').download(before.file_path); current();
  if (response.error || !response.data) throw new IndividualOrderError('SOURCE_UNAVAILABLE');
  const bytes = new Uint8Array(await response.data.arrayBuffer()); current();
  if (bytes.length !== artifact.byte_size || bytes.length > 20971520 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new IndividualOrderError('SOURCE_CHANGED');
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer)), n => n.toString(16).padStart(2, '0')).join(''); current();
  if (sha !== artifact.byte_sha256) throw new IndividualOrderError('SOURCE_CHANGED');
  const after = await readVersion();
  if (before.file_path !== after.file_path || before.file_size !== after.file_size || before.id !== after.id) throw new IndividualOrderError('SOURCE_CHANGED');
  await checkSource(); await checkOrder(); current();
  return new Blob([bytes.slice().buffer], { type: 'application/pdf' });
}
