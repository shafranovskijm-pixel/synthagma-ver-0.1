import { copyExportManifestSchema, copyExportSchema, sameCopyScope, type CopyExport, type CopyExportManifest, type CopyScope } from './contract.ts';
import { CopyRegistryError } from './errors.ts';
import { sameCopyValue } from './value.ts';

const encoder = new TextEncoder();
async function hash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function neutralHtml(html: string) {
  for (const token of html.match(/<[^>]+>/g) ?? []) {
    if (/^<\/?(?:script|iframe|object|embed|form|input|button|link|svg|math|audio|video|frameset|frame|base|img)\b/i.test(token)
      || /\s(?:on[a-z]+|src|href|action|formaction|poster|srcdoc|data|style)\s*=/i.test(token)
      || /^<meta\b[^>]*http-equiv/i.test(token)) return false;
  }
  for (const style of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) if (/url\s*\(|@import/i.test(style[1])) return false;
  return true;
}

/** Validate the complete saved snapshot; download exactly the stored UTF-8, never a filtered/rebuilt table. */
export async function verifyCopyRegistryExport(value: CopyExport, expected: { organizationId: string; scope: CopyScope; exportId: string }, current: () => boolean) {
  const requireCurrent = () => { if (!current()) throw new CopyRegistryError('ACCESS_DENIED'); };
  requireCurrent();
  const result = copyExportSchema.safeParse(value);
  if (!result.success || result.data.id !== expected.exportId) throw new CopyRegistryError();
  const saved = result.data as CopyExport;
  const jsonBytes = encoder.encode(saved.manifest_json), htmlBytes = encoder.encode(saved.html);
  if (jsonBytes.length !== saved.manifest_bytes || htmlBytes.length !== saved.html_bytes || jsonBytes.length + htmlBytes.length > 8 * 1024 * 1024) throw new CopyRegistryError();
  const [jsonHash, htmlHash] = await Promise.all([hash(jsonBytes), hash(htmlBytes)]);
  requireCurrent();
  if (jsonHash !== saved.manifest_sha256 || htmlHash !== saved.html_sha256 || !neutralHtml(saved.html)) throw new CopyRegistryError();
  let parsed: unknown;
  try { parsed = JSON.parse(saved.manifest_json); } catch { throw new CopyRegistryError(); }
  const manifestResult = copyExportManifestSchema.safeParse(parsed);
  if (!manifestResult.success) throw new CopyRegistryError();
  const manifest = manifestResult.data as CopyExportManifest;
  if (manifest.organization_id !== expected.organizationId || !sameCopyScope(manifest.scope, expected.scope) || manifest.registry_revision !== saved.registry_revision
    || manifest.counts.records !== saved.record_count || manifest.counts.history !== saved.history_count
    || manifest.records.length !== saved.record_count || manifest.history.length !== saved.history_count) throw new CopyRegistryError();
  const histories = new Map<string, typeof manifest.history>();
  let previousId = '';
  for (const row of manifest.records) {
    if (row.id <= previousId || expected.scope.kind === 'group' && row.group_id !== expected.scope.group_id) throw new CopyRegistryError();
    previousId = row.id;
    histories.set(row.id, []);
  }
  for (const entry of manifest.history) {
    const history = histories.get(entry.record_id);
    if (!history || entry.revision !== history.length + 1) throw new CopyRegistryError();
    history.push(entry);
  }
  for (const row of manifest.records) {
    const history = histories.get(row.id)!;
    const latest = history[history.length - 1];
    if (history.length !== row.revision || !latest || latest.snapshot.archived !== row.archived
      || !sameCopyValue(latest.snapshot.data, row.data) || !sameCopyValue(latest.snapshot.latest_transfer, row.latest_transfer)) throw new CopyRegistryError();
  }
  requireCurrent();
  return { json: saved.manifest_json, html: saved.html, jsonBytes, htmlBytes, manifest };
}

export function downloadVerifiedCopyRegistryExport(value: { json: string; html: string }, exportId: string, format: 'json' | 'html', current: () => boolean) {
  if (!current()) throw new CopyRegistryError('ACCESS_DENIED');
  const blob = new Blob([format === 'json' ? value.json : value.html], { type: format === 'json' ? 'application/json;charset=utf-8' : 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  let link: HTMLAnchorElement | null = null;
  let activated = false;
  try {
    if (!current()) throw new CopyRegistryError('ACCESS_DENIED');
    link = document.createElement('a'); link.href = url; link.download = 'copies_registry_' + exportId + '.' + format;
    document.body.appendChild(link); link.click(); activated = true;
  } finally {
    link?.remove();
    if (activated) setTimeout(() => URL.revokeObjectURL(url), 1000); else URL.revokeObjectURL(url);
  }
}
