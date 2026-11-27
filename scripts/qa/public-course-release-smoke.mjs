import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

// Public GET-only observation. Downloaded HTML/JavaScript is inspected as text,
// never imported, evaluated, rendered, or submitted to an authenticated backend.
const ORIGIN = 'https://xn--80aaiswd0ak.xn--p1ai';
const PAGES = Object.freeze([
  { id: 'home', pathname: '/' },
  { id: 'courses', pathname: '/rostechnadzor-courses' },
  { id: 'autoschool', pathname: '/auto-schools' },
]);
const NODE_PIN = 'v24.22.1';
const REQUEST_MS = 10_000;
const RUN_MS = 105_000; // Leaves time for the final report before the workflow's120s hard bound.
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_JS_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_CATALOG_CHUNKS = 3;
const MAX_CATALOG_DEPTH = 2;
const MAX_LITERAL_CHARS = 16_384;
const REPORT = path.resolve('.ci-artifacts/public-course-release-smoke/report.json');
const SOURCE = Object.freeze({
  baselineCommitSHA: '05b306275484761c5dfd0e1bd17768bade1edbda',
  publicExplorerSHA256: '2051ab07ef863a7d9cbacd158cbd3e242a799b95702348bff8c6ac65252c6689',
});
// Exact UI literals unique to cached PR160 PublicCourseExplorer.tsx, lines43/66/88.
const NEEDLES = Object.freeze([
  { id: 'searchPrompt', text: 'Какой навык хотите развить?' },
  { id: 'emptyCatalog', text: 'По вашему запросу курсов не найдено' },
  { id: 'freeOwnMaterials', text: 'Материалы собственных курсов добавляются бесплатно.' },
]);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const round = value => Math.round(value * 100) / 100;
const normalizePage = value => value.replace(/\/+$/, '') || '/';
const pagePaths = new Set(PAGES.map(page => page.pathname));
const catalogName = /^(?:PublicCourseExplorer|RostechnadzorCoursesPage|publicCourseExplorer|usePublicCourseCatalog|usePublicCourseDeepLink)(?:[-_.]|$)/i;
class SmokeError extends Error { constructor(code) { super(code); this.code = code; } }
const runAbort = new AbortController();
let totalBodyBytes = 0;
const started = performance.now();
const timer = setTimeout(() => runAbort.abort(new SmokeError('RUN_DEADLINE')), RUN_MS);
const found = Object.fromEntries(NEEDLES.map(needle => [needle.id, false]));
const report = {
  status: 'RUNNING', startedAtUtc: new Date().toISOString(), source: SOURCE, runtimePinMatches: process.version === NODE_PIN && process.platform === 'linux',
  pages: {}, assets: [], featureSignals: {},
  checks: {
    onlyPublicHttpsGet: true, credentialsSent: false, downloadedCodeExecuted: false,
    exactCommitProven: false, uiClickAcceptance: false, authenticatedBackendAcceptance: false,
    nodePackageInstallRequired: false,
  },
};

function permitted(url, kind) {
  if (url.origin !== ORIGIN || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false;
  if (kind === 'html') return pagePaths.has(normalizePage(url.pathname));
  return /^\/assets\/[A-Za-z0-9._~-]+\.m?js$/.test(url.pathname);
}

async function getPublic(initialUrl, kind, id) {
  const record = {
    id, addressSHA256: sha(initialUrl.href), status: 'FAILED', httpStatus: null, elapsedMs: 0,
    bodySHA256: null, contentTypeAccepted: false, bodyWithinLimits: false, redirectEncountered: false,
    finalPathMatchesRequested: false, failure: null, hops: [],
  };
  const requestStarted = performance.now();
  let current = initialUrl;
  const visited = new Set();
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      if (runAbort.signal.aborted) throw new SmokeError('RUN_DEADLINE');
      if (!permitted(current, kind)) throw new SmokeError('DISALLOWED_PUBLIC_TARGET');
      if (visited.has(current.href)) throw new SmokeError('REDIRECT_LOOP');
      visited.add(current.href);
      const abort = new AbortController();
      let timedOut = false;
      const hopStarted = performance.now();
      const hopTimer = setTimeout(() => { timedOut = true; abort.abort(); }, REQUEST_MS);
      try {
        const response = await fetch(current, {
          method: 'GET', redirect: 'manual', credentials: 'omit', cache: 'no-store',
          signal: AbortSignal.any([abort.signal, runAbort.signal]),
          headers: {
            accept: kind === 'html' ? 'text/html,application/xhtml+xml;q=0.9' : 'text/javascript,application/javascript;q=0.9',
            'user-agent': 'SINTAGMA-public-release-smoke/1.0',
          },
        });
        record.httpStatus = response.status;
        record.hops.push({ httpStatus: response.status, headersMs: round(performance.now() - hopStarted) });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          record.redirectEncountered = true;
          if (redirects === MAX_REDIRECTS) throw new SmokeError('REDIRECT_LIMIT');
          const location = response.headers.get('location');
          if (!location) throw new SmokeError('MISSING_REDIRECT_LOCATION');
          let next;
          try { next = new URL(location, current); } catch { throw new SmokeError('INVALID_REDIRECT_LOCATION'); }
          if (!permitted(next, kind)) throw new SmokeError('DISALLOWED_REDIRECT_TARGET');
          current = next;
          continue; // finally aborts/cancels this response before another same-origin GET.
        }
        if (response.status !== 200) throw new SmokeError('HTTP_STATUS');
        const type = (response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
        record.contentTypeAccepted = kind === 'html' ? ['text/html', 'application/xhtml+xml'].includes(type) : ['text/javascript', 'application/javascript', 'application/x-javascript', 'text/ecmascript', 'application/ecmascript'].includes(type);
        if (!record.contentTypeAccepted) throw new SmokeError('CONTENT_TYPE');
        const cap = kind === 'html' ? MAX_HTML_BYTES : MAX_JS_BYTES;
        const length = response.headers.get('content-length');
        if (length && /^\d+$/.test(length) && Number(length) > cap) throw new SmokeError('BODY_LIMIT');
        const chunks = [];
        let bytes = 0;
        if (!response.body) throw new SmokeError('BODY_MISSING');
        const reader = response.body.getReader();
        while (true) {
          const piece = await reader.read();
          if (piece.done) break;
          bytes += piece.value.byteLength;
          totalBodyBytes += piece.value.byteLength;
          if (bytes > cap) throw new SmokeError('BODY_LIMIT');
          if (totalBodyBytes > MAX_TOTAL_BYTES) throw new SmokeError('RUN_BODY_LIMIT');
          chunks.push(Buffer.from(piece.value));
        }
        const body = Buffer.concat(chunks, bytes);
        record.bodySHA256 = sha(body);
        record.bodyWithinLimits = true;
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(body); } catch { throw new SmokeError('UTF8_DECODE'); }
        record.status = 'OBSERVED_HTTP_200';
        record.finalPathMatchesRequested = normalizePage(current.pathname) === normalizePage(initialUrl.pathname);
        record.elapsedMs = round(performance.now() - requestStarted);
        return { record, text, finalUrl: current };
      } catch (error) {
        if (error instanceof SmokeError) throw error;
        throw new SmokeError(runAbort.signal.aborted ? 'RUN_DEADLINE' : timedOut ? 'REQUEST_TIMEOUT' : 'NETWORK_FAILURE');
      } finally {
        clearTimeout(hopTimer);
        abort.abort();
      }
    }
    throw new SmokeError('REDIRECT_LIMIT');
  } catch (error) {
    record.failure = error instanceof SmokeError ? error.code : 'UNEXPECTED_OBSERVER_FAILURE';
    record.elapsedMs = round(performance.now() - requestStarted);
    return { record, text: null, finalUrl: null };
  }
}

function moduleEntries(html, pageUrl) {
  const urls = new Map();
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const match of withoutComments.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = new Map();
    for (const attribute of match[1].matchAll(/([A-Za-z_:][A-Za-z0-9_:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      attrs.set(attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    if ((attrs.get('type') || '').toLowerCase() !== 'module' || !attrs.get('src')) continue;
    try {
      const url = new URL(attrs.get('src'), pageUrl);
      if (permitted(url, 'js')) urls.set(url.href, url);
    } catch { /* Unusable public markup is a missing entry signal, never an arbitrary request. */ }
  }
  return [...urls.values()];
}

// Bounded lexical string scan only. JS comments, regex literals and dynamic
// templates are skipped; common quoted-string Unicode/hex escapes are decoded
// without eval/Function/import/DOM execution. Oversized literals are ignored.
function visitStaticStrings(source, visit) {
  let i = 0;
  let regexAllowed = true;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && source[i + 1] === '/') { const end = source.indexOf('\n', i + 2); i = end < 0 ? source.length : end + 1; continue; }
    if (c === '/' && source[i + 1] === '*') { const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 2; continue; }
    if (c === '/' && regexAllowed) {
      let j = i + 1; let bracket = false;
      while (j < source.length && source[j] !== '\n' && source[j] !== '\r') {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '[') bracket = true;
        if (source[j] === ']') bracket = false;
        if (source[j] === '/' && !bracket) { j++; while (/[A-Za-z]/.test(source[j] || '')) j++; break; }
        j++;
      }
      i = j; regexAllowed = false; continue;
    }
    if (c === '`') { i++; while (i < source.length) { if (source[i] === '\\') { i += 2; continue; } if (source[i++] === '`') break; } regexAllowed = false; continue; }
    if (c === '"' || c === "'") {
      const quote = c; i++; let value = ''; let valid = true; let closed = false;
      while (i < source.length) {
        let next = source[i++];
        if (next === quote) { closed = true; break; }
        if (next === '\n' || next === '\r') { valid = false; break; }
        if (next === '\\') {
          next = source[i++];
          if (next === '\n') continue;
          if (next === '\r') { if (source[i] === '\n') i++; continue; }
          if (next === 'u') {
            const brace = source[i] === '{'; const start = i + (brace ? 1 : 0);
            const braceOffset = brace ? source.slice(start, start + 7).indexOf('}') : -1;
            const end = brace ? (braceOffset < 0 ? -1 : start + braceOffset) : start + 4;
            const hex = source.slice(start, end);
            if (end < start || !(brace ? /^[0-9a-fA-F]{1,6}$/ : /^[0-9a-fA-F]{4}$/).test(hex) || parseInt(hex, 16) > 0x10ffff) { valid = false; continue; }
            next = brace ? String.fromCodePoint(parseInt(hex, 16)) : String.fromCharCode(parseInt(hex, 16));
            i = end + (brace ? 1 : 0);
          } else if (next === 'x') {
            const hex = source.slice(i, i + 2);
            if (!/^[0-9a-fA-F]{2}$/.test(hex)) { valid = false; continue; }
            next = String.fromCharCode(parseInt(hex, 16)); i += 2;
          } else next = ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', 0: '\0' })[next] ?? next;
        }
        if (valid && value.length + (next?.length || 0) <= MAX_LITERAL_CHARS) value += next || '';
        else valid = false;
      }
      if (valid && closed) visit(value);
      regexAllowed = false; continue;
    }
    if (/[A-Za-z_$]/.test(c)) { const start = i++; while (/[A-Za-z0-9_$]/.test(source[i] || '')) i++; regexAllowed = /^(?:return|throw|case|delete|void|typeof|yield|await|in|instanceof)$/.test(source.slice(start, i)); continue; }
    regexAllowed = !/[\w\])}]/.test(c);
    i++;
  }
}

function inspectJs(text, parentUrl) {
  const references = new Map();
  visitStaticStrings(text, value => {
    for (const needle of NEEDLES) if (value.includes(needle.text)) found[needle.id] = true;
    if (value.length > 512 || !/\.m?js$/.test(value)) return;
    try {
      const url = new URL(value.startsWith('assets/') ? '/' + value : value, parentUrl);
      if (permitted(url, 'js') && catalogName.test(url.pathname.split('/').at(-1))) references.set(url.href, url);
    } catch { /* No inferred or guessed asset URLs. */ }
  });
  return [...references.values()];
}

async function writeReport() {
  await fs.mkdir(path.dirname(REPORT), { recursive: true });
  const serialized = JSON.stringify(report, null, 2) + '\n';
  await fs.writeFile(REPORT, serialized, 'utf8');
  return sha(serialized);
}

try {
  if (!report.runtimePinMatches) throw new SmokeError('PINNED_LINUX_NODE_REQUIRED');
  if (NEEDLES.length !== 3 || new Set(NEEDLES.map(needle => needle.text)).size !== 3) throw new SmokeError('DISTINCT_SOURCE_NEEDLES_REQUIRED');
  await writeReport(); // If killed externally, a partial artifact remains RUNNING, never a fake PASS.
  const entries = [];
  for (const page of PAGES) {
    const fetched = await getPublic(new URL(page.pathname, ORIGIN), 'html', page.id);
    report.pages[page.id] = fetched.record;
    const discovered = fetched.text === null ? [] : moduleEntries(fetched.text, fetched.finalUrl);
    fetched.record.singleSameOriginModuleEntry = discovered.length === 1;
    entries.push({ id: page.id, urls: discovered });
    await writeReport();
  }
  const entryRank = { courses: 0, home: 1, autoschool: 2 };
  const selected = [...entries].sort((a, b) => entryRank[a.id] - entryRank[b.id]).find(entry => entry.urls.length === 1)?.urls[0];
  report.checks.consistentSingleModuleEntryAcrossPages = Boolean(selected) && entries.every(entry => entry.urls.length === 1 && entry.urls[0].href === selected.href);
  const seen = new Set(); const queued = new Map(); let catalogs = 0;
  function enqueue(urls, depth) { for (const url of urls) if (!seen.has(url.href) && depth <= MAX_CATALOG_DEPTH) queued.set(url.href, { url, depth }); }
  if (selected) {
    seen.add(selected.href);
    const entry = await getPublic(selected, 'js', 'mainEntry');
    report.assets.push(entry.record);
    if (entry.text !== null) enqueue(inspectJs(entry.text, entry.finalUrl), 1);
    await writeReport();
  }
  while (queued.size && catalogs < MAX_CATALOG_CHUNKS && !Object.values(found).every(Boolean) && !runAbort.signal.aborted) {
    const priority = item => /PublicCourseExplorer/i.test(item.url.pathname) ? 0 : /RostechnadzorCoursesPage/i.test(item.url.pathname) ? 1 : 2;
    const next = [...queued.values()].sort((a, b) => priority(a) - priority(b) || a.url.pathname.localeCompare(b.url.pathname))[0];
    queued.delete(next.url.href); if (seen.has(next.url.href)) continue;
    seen.add(next.url.href); catalogs++;
    const chunk = await getPublic(next.url, 'js', 'catalog' + catalogs);
    report.assets.push(chunk.record);
    if (chunk.text !== null) enqueue(inspectJs(chunk.text, chunk.finalUrl), next.depth + 1);
    await writeReport();
  }
  report.checks.catalogFetchLimitReached = catalogs === MAX_CATALOG_CHUNKS && !Object.values(found).every(Boolean);
  for (const needle of NEEDLES) report.featureSignals[needle.id] = { sourceNeedleSHA256: sha(needle.text), observedInBoundedStaticJsStrings: found[needle.id] };
  report.checks.threeDistinctFeatureSignalsObserved = Object.values(found).every(Boolean);
  report.checks.publicHtmlRoutesObserved = PAGES.every(page => report.pages[page.id]?.status === 'OBSERVED_HTTP_200' && report.pages[page.id].finalPathMatchesRequested && report.pages[page.id].singleSameOriginModuleEntry);
  report.checks.mainEntryObserved = report.assets.some(asset => asset.id === 'mainEntry' && asset.status === 'OBSERVED_HTTP_200');
  report.checks.requestedJsAssetsObserved = report.assets.length > 0 && report.assets.every(asset => asset.status === 'OBSERVED_HTTP_200');
  report.status = report.checks.publicHtmlRoutesObserved && report.checks.consistentSingleModuleEntryAcrossPages && report.checks.mainEntryObserved && report.checks.requestedJsAssetsObserved && report.checks.threeDistinctFeatureSignalsObserved ? 'PUBLIC_HTTP_AND_BOUNDED_JS_SIGNALS_CONFIRMED' : 'PUBLIC_SMOKE_FAILED_OR_SIGNALS_UNCONFIRMED';
} catch (error) {
  report.status = 'PUBLIC_SMOKE_FAILED_OR_SIGNALS_UNCONFIRMED';
  report.failure = error instanceof SmokeError ? error.code : 'UNEXPECTED_OBSERVER_FAILURE';
} finally {
  clearTimeout(timer); runAbort.abort();
  report.finishedAtUtc = new Date().toISOString();
  report.elapsedMs = round(performance.now() - started);
  report.checks.finishedWithinRunBudget = report.elapsedMs < RUN_MS + 10_000;
  if (!report.checks.finishedWithinRunBudget) report.status = 'PUBLIC_SMOKE_FAILED_OR_SIGNALS_UNCONFIRMED';
  try {
    const reportSHA256 = await writeReport();
    console.log(JSON.stringify({ status: report.status, reportSHA256, elapsedMs: report.elapsedMs, checks: report.checks }));
  } catch { console.error(JSON.stringify({ status: 'REPORT_WRITE_FAILED' })); process.exitCode = 1; }
  if (report.status !== 'PUBLIC_HTTP_AND_BOUNDED_JS_SIGNALS_CONFIRMED') process.exitCode = 1;
}
