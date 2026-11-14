import { supabase } from '@/integrations/supabase/client';
import type { Admission, Configuration, DeclaredBasis, Manifest, NpaEditorialRpc, EditorialScope, EditorialBank, CheckRun, NormativeEditorialWorkspace } from '@/types/rtn-npa';
export type { EditorialScope, EditorialBank, CheckRun, NormativeEditorialWorkspace } from '@/types/rtn-npa';

export class NpaEditorialError extends Error {
  constructor(public kind: 'denied' | 'cas' | 'rejected' | 'uncertain' | 'invalid' | 'context', message: string) { super(message); }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const instant = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const nullableString = (v: unknown) => v === null || typeof v === 'string';
const integer = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const isoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
function fail(): never { throw new NpaEditorialError('invalid', 'Получены неполные данные нормативной проверки. Обновите данные.'); }
function admission(v: unknown): v is Admission {
  return record(v) && typeof v.allowed === 'boolean' && ['current', 'review_required'].includes(v.normative_status as string)
    && ['manual_review', 'automatic_attestation', 'blocked'].includes(v.admission_basis as string)
    && (v.normative_cutoff_at === null || instant(v.normative_cutoff_at)) && integer(v.finding_epoch)
    && Array.isArray(v.reasons) && v.reasons.every(x => typeof x === 'string') && nullableString(v.latest_check_status)
    && (v.latest_check_at === null || instant(v.latest_check_at));
}
function run(v: unknown): v is CheckRun {
  return record(v) && typeof v.id === 'string' && ['queued', 'running', 'completed'].includes(v.status as string)
    && ['configuration_id', 'release_id', 'key_set_id', 'manifest_id', 'context_sha256', 'outcome', 'error_code'].every(k => nullableString(v[k]))
    && integer(v.finding_epoch) && integer(v.manifest_version) && instant(v.queued_at)
    && (v.completed_at === null || instant(v.completed_at)) && typeof v.proof_full === 'boolean'
    && typeof v.can_approve === 'boolean' && Array.isArray(v.reason_codes) && v.reason_codes.every(x => typeof x === 'string')
    && Array.isArray(v.observations) && (v.discovery_evidence === null || record(v.discovery_evidence));
}
export function validateWorkspace(v: unknown): NormativeEditorialWorkspace {
  if (!record(v) || !instant(v.server_time) || !Array.isArray(v.banks)) return fail();
  const ids = new Set<string>();
  for (const b of v.banks) {
    if (!record(b) || typeof b.bank_id !== 'string' || ids.has(b.bank_id) || typeof b.code !== 'string' || typeof b.title !== 'string'
      || !nullableString(b.release_id) || !admission(b.admission) || !Array.isArray(b.pending_findings)
      || !Array.isArray(b.check_runs) || !b.check_runs.every(run) || (b.latest_check !== null && !run(b.latest_check))) return fail();
    ids.add(b.bank_id);
    if (b.configuration !== null && (!record(b.configuration) || typeof b.configuration.id !== 'string'
      || !integer(b.configuration.version) || !Array.isArray(b.configuration.basis) || !b.configuration.basis.length
      || typeof b.configuration.release_id !== 'string' || typeof b.configuration.context_sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(b.configuration.context_sha256)
      || typeof b.configuration.discovery_from !== 'string' || !instant(b.configuration.created_at))) return fail();
    if (b.configuration !== null) {
      try { parseDeclaredBasis(JSON.stringify((b.configuration as Configuration).basis)); } catch { return fail(); }
      if (!isoDate((b.configuration as Configuration).discovery_from)) return fail();
    }
    if (b.manifest !== null && (!record(b.manifest) || typeof b.manifest.id !== 'string' || !integer(b.manifest.version)
      || typeof b.manifest.stable_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(b.manifest.stable_sha256)
      || !instant(b.manifest.approved_at) || (b.manifest.hard_stop_at !== null && !instant(b.manifest.hard_stop_at))
      || !integer(b.manifest.acknowledged_epoch) || typeof b.manifest.run_id !== 'string')) return fail();
  }
  return v as unknown as NormativeEditorialWorkspace;
}

async function ensureSession(scope: EditorialScope) {
  if (scope.signal?.aborted || !scope.actorId || !scope.organizationId) throw new NpaEditorialError('context', 'Контекст изменился. Загрузите данные заново.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token || data.session.user.id !== scope.actorId || scope.signal?.aborted)
    throw new NpaEditorialError('context', 'Сеанс изменился или недоступен. Загрузите данные заново.');
}
type Rpc = { [K in keyof NpaEditorialRpc]: (name: K, args: NpaEditorialRpc[K]['args']) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> }[keyof NpaEditorialRpc];
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;
async function call<K extends keyof NpaEditorialRpc>(scope: EditorialScope, name: K, args: NpaEditorialRpc[K]['args']): Promise<NpaEditorialRpc[K]['result']> {
  await ensureSession(scope);
  let result: { data: unknown; error: { code?: string; message?: string } | null };
  try {
    const request = (rpc as (n: string, a: unknown) => PromiseLike<typeof result> & { abortSignal?: (s: AbortSignal) => PromiseLike<typeof result> })(name, args);
    result = await (scope.signal && request.abortSignal ? request.abortSignal(scope.signal) : request);
  } catch {
    if (scope.signal?.aborted) throw new NpaEditorialError('context', 'Контекст изменился. Ответ прежнего запроса не используется.');
    throw new NpaEditorialError('uncertain', 'Ответ сервера не получен. Результат неизвестен; повторите тот же сохранённый запрос.');
  }
  await ensureSession(scope);
  if (result.error) {
    const e = result.error;
    if (e.code === '42501' || e.code === 'PGRST301' || e.code === '401') throw new NpaEditorialError('denied', 'Права администратора не подтверждены. Обновите сеанс и данные.');
    if (['40001', '409', 'PT409'].includes(e.code || '') || /(?:stale|conflict|configuration_changed|manifest_changed|context_changed|finding_epoch)/i.test(e.message || ''))
      throw new NpaEditorialError('cas', 'Нормативный контекст изменился. Явно обновите данные; форма и подготовленный запрос будут сброшены.');
    // A PostgreSQL invalid-parameter exception rolls the RPC transaction back.
    // It is a definite rejection, unlike a lost response or malformed success.
    if (e.code === '22023') throw new NpaEditorialError('rejected', 'Сервер отклонил действие. Обновите данные и проверьте основания, подтверждения и пояснение.');
    throw new NpaEditorialError('uncertain', 'Сервер не подтвердил сохранение. Сохранённый запрос можно повторить без изменения его номера и параметров.');
  }
  if (!record(result.data)) return fail();
  return result.data as NpaEditorialRpc[K]['result'];
}
export async function getRtnNormativeEditorial(scope: EditorialScope) {
  return validateWorkspace(await call(scope, 'get_rtn_npa_editorial_workspace', {}));
}
export type FrozenRequest =
  | { operation: 'configure'; args: NpaEditorialRpc['configure_rtn_npa_basis']['args'] }
  | { operation: 'approve'; args: NpaEditorialRpc['approve_rtn_npa_manifest']['args'] }
  | { operation: 'acknowledge'; args: NpaEditorialRpc['acknowledge_rtn_npa_manual_review']['args'] };
export function freezeRequest<T extends FrozenRequest>(request: T): T {
  const freeze = (v: unknown): void => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } };
  const copy = JSON.parse(JSON.stringify(request)) as T; freeze(copy); return copy;
}
export async function executeRtnNormativeRequest(scope: EditorialScope, request: FrozenRequest) {
  if (request.operation === 'configure') {
    const r = await call(scope, 'configure_rtn_npa_basis', request.args);
    if (typeof r.configuration_id !== 'string' || !integer(r.version) || typeof r.replayed !== 'boolean'
      || !Array.isArray(r.basis) || !integer(r.supported_count) || !integer(r.unsupported_count)
      || r.supported_count + r.unsupported_count !== r.basis.length) return fail();
    try { parseDeclaredBasis(JSON.stringify(r.basis)); } catch { return fail(); }
    return r;
  }
  if (request.operation === 'approve') {
    const r = await call(scope, 'approve_rtn_npa_manifest', request.args);
    if (typeof r.manifest_id !== 'string' || !admission(r.admission) || typeof r.replayed !== 'boolean' || !integer(r.version)
      || typeof r.stable_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(r.stable_sha256)
      || (r.hard_stop_at !== null && !instant(r.hard_stop_at))) return fail();
    return r;
  }
  const r = await call(scope, 'acknowledge_rtn_npa_manual_review', request.args);
  if (typeof r.review_id !== 'string' || !integer(r.acknowledged_epoch) || !admission(r.admission) || typeof r.replayed !== 'boolean') return fail();
  return r;
}
export async function requestRtnNormativeEditorialCheck(scope: EditorialScope, bankId: string) {
  // The genuine-user Edge verifies actual-admin through its user RPC, enqueues
  // this own run and starts bounded background work. The browser never claims
  // or completes work. The operation flag is not an authorization capability.
  await ensureSession(scope);
  let response: { data: unknown; error: unknown };
  try { response = await supabase.functions.invoke('rtn-npa-check', { body: { operation: 'editorial', bankId }, ...(scope.signal ? { signal: scope.signal } : {}) }); }
  catch { throw new NpaEditorialError('uncertain', 'Сервер не подтвердил запуск проверки. Обновите данные, чтобы сверить очередь.'); }
  await ensureSession(scope);
  if (response.error || !record(response.data)) throw new NpaEditorialError('uncertain', 'Сервер не подтвердил запуск проверки. Обновите данные, чтобы сверить очередь.');
  const r = response.data as NpaEditorialRpc['request_rtn_npa_editorial_check']['result'];
  if (typeof r.run_id !== 'string' || !['queued', 'running', 'completed'].includes(r.status) || !instant(r.queued_at)) return fail();
  return r;
}
export function parseDeclaredBasis(text: string): DeclaredBasis[] {
  if (text.length > 100_000) throw new Error('Список оснований должен быть не больше 100 КБ.');
  let rows: unknown; try { rows = JSON.parse(text); } catch { throw new Error('Проверьте JSON списка нормативных оснований.'); }
  if (!Array.isArray(rows) || !rows.length || rows.length > 100 || rows.some(r => !record(r) || r.country !== 'RU'
    || typeof r.kind !== 'string' || !r.kind.trim() || r.kind.length > 100 || typeof r.number !== 'string' || !r.number.trim() || r.number.length > 100
    || typeof r.title !== 'string' || !r.title.trim() || r.title.length > 1000 || !isoDate(r.date)
    || Object.keys(r).some(k => !['country', 'kind', 'date', 'number', 'title', 'docid', 'dochash'].includes(k))
    || (r.docid !== undefined && (!Number.isInteger(r.docid) || (r.docid as number) <= 0))
    || (r.kind === 'FederalLaw' && (!Number.isInteger(r.docid) || (r.docid as number) <= 0))
    || (r.dochash !== undefined && r.dochash !== null && (typeof r.dochash !== 'string' || !/^[a-f0-9]{64}$/.test(r.dochash)))))
    throw new Error('Нужен непустой массив документов: country RU, kind, date, number, title.');
  return rows as DeclaredBasis[];
}
export function publicEvidenceUrl(value: string): string | null {
  try {
    const u = new URL(value.trim());
    if (u.username || u.password || u.port || !['http:', 'https:'].includes(u.protocol) || /\/object\/sign\//i.test(u.pathname)
      || [...u.searchParams.keys()].some(k => /^(token|access_token|authorization|api_key)$/i.test(k))) return null;
    const host = u.hostname.toLowerCase();
    if (!['pravo.gov.ru', 'www.pravo.gov.ru', 'actual.pravo.gov.ru', 'publication.pravo.gov.ru', 'gosnadzor.ru', 'www.gosnadzor.ru'].includes(host)) return null;
    if (u.protocol === 'http:' && !['pravo.gov.ru', 'www.pravo.gov.ru', 'actual.pravo.gov.ru', 'publication.pravo.gov.ru'].includes(host)) return null;
    if (u.hash && !/^http:\/\/actual\.pravo\.gov\.ru\/content\/content\.html#hash=[A-Za-z0-9_-]+&bpa=ebpi&ttl=[012]$/.test(u.href)) return null;
    return u.href;
  } catch { return null; }
}
export function approvalBlock(bank: EditorialBank, check: CheckRun | null, serverTime: string): string | null {
  if (!bank.configuration || !bank.release_id || !check || check.id !== bank.latest_check?.id) return 'Нужны текущая конфигурация, выпуск и последняя проверка.';
  if (check.status !== 'completed' || !check.completed_at || !check.proof_full || !check.can_approve
    // A complete first bootstrap has no previous manifest to compare and SQL
    // legitimately calls its outcome unknown. Full proof + authoritative
    // can_approve + the exact binding below still remain mandatory.
    || !['unchanged', 'needs_subject_review', 'unknown'].includes(check.outcome || '')) return 'Проверка не завершена с полными подтверждениями.';
  const age = Date.parse(serverTime) - Date.parse(check.completed_at);
  if (!Number.isFinite(age) || age < 0 || age > 15 * 60_000) return 'Подтверждения устарели. Запросите новую проверку.';
  if (check.configuration_id !== bank.configuration.id || check.release_id !== bank.release_id
    || bank.configuration.release_id !== bank.release_id || bank.configuration.context_sha256 !== check.context_sha256
    || check.manifest_id !== (bank.manifest?.id ?? null) || check.manifest_version !== (bank.manifest?.version ?? 0)
    || check.finding_epoch !== bank.admission.finding_epoch || !check.context_sha256
    || !/^[a-f0-9]{64}$/.test(check.context_sha256)) return 'Проверка относится к другому нормативному контексту.';
  const sources = check.observations.filter(o => record(o) && o.identity_key === 'question-source');
  const npa = check.observations.filter(o => record(o) && o.identity_key !== 'question-source');
  if (sources.length !== 1 || npa.length !== bank.configuration.basis.length || !npa.length) return 'Подтверждены не все заявленные основания и исходные вопросы.';
  const artifactComplete = (a: unknown, questionSource = false) => {
    if (!record(a) || typeof a.path !== 'string' || !a.path.startsWith(`npa250/${check.id}/`)
      || typeof a.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(a.sha256) || typeof a.bytes !== 'number'
      || a.bytes <= 0 || a.http_status !== 200 || !instant(a.received_at) || typeof a.request_url !== 'string') return false;
    try {
      const u = new URL(a.request_url);
      const hosts = questionSource ? ['gosnadzor.ru', 'www.gosnadzor.ru'] : ['actual.pravo.gov.ru', 'pravo.gov.ru', 'www.pravo.gov.ru', 'publication.pravo.gov.ru', 'www.publication.pravo.gov.ru'];
      return !u.username && !u.password && ['http:', 'https:'].includes(u.protocol) && hosts.includes(u.hostname)
        && (!u.port || (u.hostname === 'actual.pravo.gov.ru' && u.port === '8000'));
    } catch { return false; }
  };
  const source = sources[0];
  if (!record(source) || source.exact_context !== true || !record(source.stable) || typeof source.stable.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(source.stable.sha256) || !artifactComplete(source.artifacts, true)) return 'Исходный документ вопросов не подтверждён в точном контексте.';
  const discovery = check.discovery_evidence;
  if (!record(discovery) || discovery.source !== 'publication-pravo-federal-laws' || discovery.complete !== true
    || discovery.relevance_complete !== true || discovery.error_code !== null || !isoDate(discovery.from) || !isoDate(discovery.to_exclusive)
    || discovery.from < bank.configuration.discovery_from || discovery.to_exclusive <= discovery.from
    || !Array.isArray(discovery.unresolved_candidates) || discovery.unresolved_candidates.length || !integer(discovery.reported_total)
    || !Array.isArray(discovery.pages) || !discovery.pages.length || !Array.isArray(discovery.resolved_publications))
    return 'Полная сверка новых публикаций не подтверждена.';
  const publicationArtifact = (v: unknown) => {
    if (!artifactComplete(v) || !record(v) || typeof v.request_url !== 'string') return false;
    const u = new URL(v.request_url);
    return ['publication.pravo.gov.ru', 'www.publication.pravo.gov.ru'].includes(u.hostname) && u.pathname.startsWith('/search');
  };
  const resolvedOriginalArtifact = (v: unknown) => {
    if (!artifactComplete(v) || !record(v) || typeof v.request_url !== 'string') return false;
    const u = new URL(v.request_url);
    return (['publication.pravo.gov.ru', 'www.publication.pravo.gov.ru'].includes(u.hostname) && /^\/(api\/|document\/|file\/)/.test(u.pathname))
      || (u.protocol === 'http:' && u.hostname === 'actual.pravo.gov.ru' && u.port === '8000' && u.pathname === '/api/ebpi/redtext' && !!u.search);
  };
  const publications = new Set<string>(); const pageIndexes = new Set<number>();
  for (const page of discovery.pages) {
    if (!record(page) || !integer(page.index) || pageIndexes.has(page.index as number) || page.reported_total !== discovery.reported_total
      || !Array.isArray(page.publication_ids) || !page.publication_ids.every(x => typeof x === 'string') || !publicationArtifact(page.artifact))
      return 'Страницы первичных публикаций неполны или несогласованы.';
    pageIndexes.add(page.index as number);
    for (const id of page.publication_ids as string[]) { if (publications.has(id)) return 'Публикации на страницах повторяются. Нужна новая сверка.'; publications.add(id); }
  }
  const sortedPages = [...pageIndexes].sort((a, b) => a - b);
  if (sortedPages.some((v, i) => v !== sortedPages[0] + i) || publications.size !== discovery.reported_total) return 'Охват публикаций не подтверждён полностью.';
  const resolved = new Set<string>();
  for (const p of discovery.resolved_publications) {
    if (!record(p) || typeof p.publication_id !== 'string' || !publications.has(p.publication_id) || resolved.has(p.publication_id)
      || !['not_related', 'known_changing_act'].includes(p.relation as string) || !Array.isArray(p.basis_docids)
      || !Array.isArray(p.graph_reference_ids) || !resolvedOriginalArtifact(p.artifact)) return 'Не все публикации разрешены по первичным подтверждениям.';
    resolved.add(p.publication_id);
  }
  if (resolved.size !== publications.size) return 'Остались публикации без установленной связи с основаниями.';
  const identities = new Set<string>(); const matchedBasis = new Set<number>();
  for (const observation of npa) {
    if (!record(observation) || typeof observation.identity_key !== 'string' || identities.has(observation.identity_key)
      || !instant(observation.fetched_at) || typeof observation.projection_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(observation.projection_sha256)
      || !record(observation.stable) || !record(observation.stable.identity) || !record(observation.stable.current)
      || !record(observation.stable.graph) || !Array.isArray(observation.stable.graph.future_editions) || !record(observation.artifacts)) return 'Неполные первичные подтверждения. Утверждение закрыто.';
    identities.add(observation.identity_key);
    const identity = observation.stable.identity;
    const current = observation.stable.current;
    const basisIndex = bank.configuration.basis.findIndex(b => b.country === identity.country && b.kind === identity.kind && b.date === identity.date
      && b.number === identity.number && (!b.docid || b.docid === identity.docid) && (!b.dochash || b.dochash === identity.dochash));
    if (basisIndex < 0 || matchedBasis.has(basisIndex)
      || !['actual', 'official', 'checked', 'redcompleted', 'hascontent', 'contentcomplete'].every(k => current[k] === true)
      || typeof current.text_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(current.text_sha256)
      || !isoDate(current.effective_from)
      || current.effective_from > new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(serverTime))) return 'Не все текущие редакции и основания подтверждены.';
    matchedBasis.add(basisIndex);
    for (const kind of ['identity', 'redactions', 'redtext', 'card']) {
      if (!artifactComplete(observation.artifacts[kind])) return 'Отсутствует полный набор первичных файлов или их источники не подтверждены.';
    }
  }
  return null;
}
