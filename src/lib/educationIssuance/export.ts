import { sameCopyValue } from '@/lib/copyRegistry/value';
import * as c from './contract.ts';
import { EducationIssuanceError, assertIssuanceRecords, assertIssuanceEvents, readEducationIssuance, requireIssuanceScope, type EducationIssuanceScope } from './client.ts';
import type { IssuanceExport, IssuanceQuery, IssuanceSnapshot } from './types.ts';

const MAX_BYTES = 8 * 1024 * 1024;
const utf8 = (text: string) => new TextEncoder().encode(text);
async function sha256(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer)), n => n.toString(16).padStart(2, '0')).join(''); }
export type IssuanceExportQuery = Extract<IssuanceQuery, { kind: 'export' }>;

export async function verifyIssuanceExport(scope: EducationIssuanceScope, artifact: IssuanceExport, query: IssuanceExportQuery): Promise<IssuanceSnapshot> {
  requireIssuanceScope(scope);
  const parsed = c.issuanceExportSchema.safeParse(artifact); if (!parsed.success) throw new EducationIssuanceError();
  const json = utf8(artifact.snapshot_json), html = utf8(artifact.html);
  if (json.length + html.length > MAX_BYTES || json.length + html.length !== artifact.utf8_bytes
    || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(json) !== artifact.snapshot_json
    || new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(html) !== artifact.html) throw new EducationIssuanceError();
  const hashes = await Promise.all([sha256(json), sha256(html)]); requireIssuanceScope(scope);
  if (hashes[0] !== artifact.snapshot_sha256 || hashes[1] !== artifact.html_sha256) throw new EducationIssuanceError();
  let raw: unknown; try { raw = JSON.parse(artifact.snapshot_json); } catch { throw new EducationIssuanceError(); }
  const snapshotParse = c.issuanceExportSnapshotSchema.safeParse(raw); if (!snapshotParse.success) throw new EducationIssuanceError();
  const snapshot = snapshotParse.data as IssuanceSnapshot;
  if (snapshot.organization_id !== scope.organizationId || snapshot.captured_by !== scope.actorId || !sameCopyValue(snapshot.scope, scope.issuanceScope)
    || new Set(snapshot.records.map(row => row.official.id)).size !== snapshot.records.length || new Set(snapshot.history.map(row => row.id)).size !== snapshot.history.length
    || new Set(snapshot.missing.map(row => row.enrollment_id)).size !== snapshot.missing.length) throw new EducationIssuanceError();
  if (query.selection.kind === 'records') {
    const selected = query.selection.record_ids;
    if (snapshot.missing.length || snapshot.records.length !== selected.length || snapshot.records.some(row => !selected.includes(row.official.id))) throw new EducationIssuanceError();
  } else {
    const selected = query.selection.enrollment_ids, courseId = query.selection.course_id;
    if (snapshot.records.some(row => !row.official.enrollment_id || !selected.includes(row.official.enrollment_id) || row.official.course_id !== null && row.official.course_id !== courseId)
      || snapshot.missing.some(row => !selected.includes(row.enrollment_id))) throw new EducationIssuanceError();
    for (const enrollmentId of selected) {
      const rows = snapshot.records.filter(row => row.official.enrollment_id === enrollmentId), missing = snapshot.missing.find(row => row.enrollment_id === enrollmentId);
      if (!rows.length ? missing?.code !== 'NOT_ISSUED' : rows.every(row => row.lifecycle === 'annulled') ? missing?.code !== 'ANNULLED_ONLY' : missing !== undefined) throw new EducationIssuanceError();
    }
  }
  assertIssuanceRecords(scope, snapshot.records); assertIssuanceEvents(scope, snapshot.history);
  const histories = new Map(snapshot.records.map(row => [row.official.id, [] as typeof snapshot.history]));
  for (const event of snapshot.history) { const history = histories.get(event.record_id); if (!history) throw new EducationIssuanceError(); history.push(event); }
  for (const row of snapshot.records) {
    if (row.official.organization_id !== scope.organizationId || scope.issuanceScope.kind === 'group' && row.official.group_id !== null && row.official.group_id !== scope.issuanceScope.group_id) throw new EducationIssuanceError();
    const events = histories.get(row.official.id)!.sort((a, b) => a.revision - b.revision);
    if (events.length !== row.revision) throw new EducationIssuanceError();
    for (let i = 0; i < events.length; i++) if (events[i].revision !== i + 1 || i > 0 && events[i].previous_state_hash !== events[i - 1].state_hash) throw new EducationIssuanceError();
    if (events.length && events[events.length - 1].state_hash !== row.state_hash) throw new EducationIssuanceError();
  }
  const document = new DOMParser().parseFromString(artifact.html, 'text/html');
  if (document.querySelector('script,iframe,frame,object,embed,form,base,link,meta[http-equiv],audio,video,svg,math')
    || Array.from(document.querySelectorAll('*')).some(node => Array.from(node.attributes).some(attr => /^on/i.test(attr.name) || /^(src|srcset|href|action|formaction)$/i.test(attr.name)))) throw new EducationIssuanceError();
  requireIssuanceScope(scope); return snapshot;
}
export function downloadIssuanceBlob(scope: EducationIssuanceScope, blob: Blob, name: string) {
  requireIssuanceScope(scope); const url = URL.createObjectURL(blob);
  let link:HTMLAnchorElement|null=null,activated=false;
  try { requireIssuanceScope(scope);link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);requireIssuanceScope(scope);link.click();activated=true; }
  finally { link?.remove();if(activated)window.setTimeout(()=>URL.revokeObjectURL(url),1000);else URL.revokeObjectURL(url); }
}
/** This read never creates documents, allocates numbers or records delivery. */
export async function loadIssuanceExport(scope: EducationIssuanceScope, query: IssuanceExportQuery) {
  const result = await readEducationIssuance(scope, query);
  if (result.kind !== 'export') throw new EducationIssuanceError();
  return { artifact: result.artifact, snapshot: await verifyIssuanceExport(scope, result.artifact, query) };
}
export async function downloadIssuanceExport(scope: EducationIssuanceScope, query: IssuanceExportQuery, format: 'json' | 'html') {
  const { artifact, snapshot } = await loadIssuanceExport(scope, query);
  downloadIssuanceBlob(scope, new Blob([format === 'json' ? artifact.snapshot_json : artifact.html], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/html;charset=utf-8' }), `Журнал_выдачи.${format}`);
  return snapshot;
}
