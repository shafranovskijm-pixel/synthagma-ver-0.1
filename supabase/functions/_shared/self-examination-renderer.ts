export interface SelfExaminationFact {
  key: string;
  label: string;
  section: string;
  unit: string | null;
  state: "unknown" | "entered" | "confirmed" | "not_applicable";
  value: string | number | boolean | null | { count: number; share: number | null; undefined_share_reason: string | null };
  sourceCurrent: boolean;
  location: string | null;
  reviewNote: string | null;
}
export interface SelfExaminationDraftInput {
  organizationTitle: string;
  reportingYear: number;
  providerLabel: string;
  legalBasisNote: string | null;
  facts: SelfExaminationFact[];
  indicators: SelfExaminationFact[];
  legalReferences: Array<{ title: string; url: string }>;
  generatedAt: string;
}

const PRIMARY_HOSTS = new Set([
  "publication.pravo.gov.ru", "pravo.gov.ru", "www.pravo.gov.ru",
  "obrnadzor.gov.ru", "www.obrnadzor.gov.ru", "minobrnauki.gov.ru", "www.minobrnauki.gov.ru",
  "edu.gov.ru", "www.edu.gov.ru", "minjust.gov.ru", "www.minjust.gov.ru", "archives.gov.ru", "www.archives.gov.ru",
]);
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
const hasText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const validText = (value: unknown, limit: number, nullable = false): boolean => nullable && value === null
  || typeof value === "string" && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
const invalid = (): never => { throw new Error("INVALID_SELF_EXAMINATION_DRAFT"); };

function primaryUrl(value: string): string | null {
  if (value !== value.trim() || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const primary = PRIMARY_HOSTS.has(host) || host === "minjust.consultant.ru" && /^\/(?:documents|files)\/[0-9]+$/.test(url.pathname);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port
      || !primary || url.href.length > 2048
      || [...url.searchParams.keys()].some(key => /(?:token|signature|credential|password|authorization|session|secret|api.?key)/i.test(key))) return null;
    return url.href;
  } catch { return null; }
}

// Known private locators are replaced with a cabinet reference. This is not
// universal free-text DLP; the authenticated projector must also redact input.
function sourceLabel(value: string | null): string {
  if (!hasText(value)) return "Источник указан в кабинете центра";
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value)
    || /(?:file:\/\/|(?:^|\s)[a-z]:[\\/]|sb-storage\/|storage\/v1\/|object\/(?:sign|authenticated)\/|(?:org-documents|signed-documents|external-contracts)\/|[?&](?:token|access_token|signature|authorization|api[_-]?key)=|\bBearer\s|\beyJ[\w-]+\.[\w-]+\.[\w-]+)/i.test(value)) return "Источник доступен в защищённом кабинете центра";
  return escapeHtml(value);
}

interface RenderedFact { html: string; needsReview: boolean; reason: string }
function renderValue(fact: SelfExaminationFact): RenderedFact {
  if (!fact.sourceCurrent) return { html: "Нужно перепроверить источник", needsReview: true, reason: "Источник изменился или его актуальность не подтверждена" };
  if (fact.state === "not_applicable") {
    return hasText(fact.reviewNote)
      ? { html: `Не применяется: ${escapeHtml(fact.reviewNote)}`, needsReview: false, reason: "" }
      : { html: "Нужно обосновать неприменимость", needsReview: true, reason: "Отсутствует явное обоснование неприменимости" };
  }
  if (fact.state !== "confirmed") return { html: fact.state === "entered" ? "Заполнено в черновике — нужно подтвердить" : "Нужно добавить подтверждённые сведения",
    needsReview: true, reason: fact.state === "entered" ? "Введённые сведения ещё не подтверждены" : "Подтверждённые сведения отсутствуют" };
  const value = fact.value;
  if (typeof value === "string" && hasText(value)) return { html: escapeHtml(value), needsReview: false, reason: "" };
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER) return { html: escapeHtml(String(value)), needsReview: false, reason: "" };
  if (typeof value === "boolean") return { html: value ? "Да" : "Нет", needsReview: false, reason: "" };
  if (value !== null && typeof value === "object" && Number.isSafeInteger(value.count) && value.count >= 0
    && (value.share === null || typeof value.share === "number" && Number.isFinite(value.share) && value.share >= 0 && value.share <= 100)) {
    if (value.share !== null) return { html: `${value.count}; доля ${value.share}%`, needsReview: false, reason: "" };
    return { html: `${value.count}; доля не рассчитана${hasText(value.undefined_share_reason) ? `: ${escapeHtml(value.undefined_share_reason)}` : " — нужно указать основание расчёта"}`,
      needsReview: !hasText(value.undefined_share_reason), reason: hasText(value.undefined_share_reason) ? "" : "Нет значения доли и причины, по которой она не определена" };
  }
  return { html: "Нужно заполнить корректное подтверждённое значение", needsReview: true, reason: "Подтверждённое значение отсутствует или некорректно" };
}

function validateFacts(rows: readonly SelfExaminationFact[]): void {
  if (!Array.isArray(rows) || rows.length > 500) return invalid();
  const keys = new Set<string>();
  for (const fact of rows) {
    if (!fact || !hasText(fact.key) || !validText(fact.key, 200) || keys.has(fact.key)
      || !hasText(fact.label) || !validText(fact.label, 1000) || !hasText(fact.section) || !validText(fact.section, 1000)
      || !validText(fact.unit, 200, true) || !validText(fact.location, 4000, true) || !validText(fact.reviewNote, 8000, true)
      || !["unknown", "entered", "confirmed", "not_applicable"].includes(fact.state) || typeof fact.sourceCurrent !== "boolean") return invalid();
    const value = fact.value;
    if (!(value === null || typeof value === "boolean" || typeof value === "number" || validText(value, 20_000)
      || typeof value === "object" && value !== null && typeof value.count === "number"
      && (value.share === null || typeof value.share === "number") && validText(value.undefined_share_reason, 4000, true))) return invalid();
    keys.add(fact.key);
  }
}

/** Renders only the supplied authenticated, frozen projection. It never changes, approves or publishes it. */
export function renderSelfExaminationDraft(input: SelfExaminationDraftInput): string {
  if (!input || !hasText(input.organizationTitle) || !validText(input.organizationTitle, 4000)
    || !hasText(input.providerLabel) || !validText(input.providerLabel, 2000) || !validText(input.legalBasisNote, 8000, true)
    || !Number.isSafeInteger(input.reportingYear) || input.reportingYear < 1900 || input.reportingYear > 9999
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.generatedAt)
    || !Number.isFinite(Date.parse(input.generatedAt)) || !Array.isArray(input.legalReferences) || input.legalReferences.length > 100) return invalid();
  const [year, month, day] = input.generatedAt.slice(0, 10).split("-").map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()
    || Number(input.generatedAt.slice(11, 13)) > 23 || Number(input.generatedAt.slice(14, 16)) > 59 || Number(input.generatedAt.slice(17, 19)) > 59) return invalid();
  validateFacts(input.facts); validateFacts(input.indicators);
  for (const reference of input.legalReferences) if (!reference || !hasText(reference.title) || !validText(reference.title, 2000) || typeof reference.url !== "string") return invalid();
  const missing: Array<{ label: string; section: string; reason: string }> = [];
  const renderTable = (rows: readonly SelfExaminationFact[], heading: string): string => {
    if (!rows.length) { missing.push({ label: heading, section: heading, reason: "Раздел не содержит подтверждённых фактов" }); return `<section><h2>${escapeHtml(heading)}</h2><p class="pending">Нужно добавить подтверждённые сведения.</p></section>`; }
    const sections = new Map<string, SelfExaminationFact[]>();
    for (const fact of rows) sections.set(fact.section, [...(sections.get(fact.section) ?? []), fact]);
    return `<section><h2>${escapeHtml(heading)}</h2>${[...sections].map(([section, facts]) => `<h3>${escapeHtml(section)}</h3><table><thead><tr><th scope="col">Показатель / сведения</th><th scope="col">Значение</th><th scope="col">Основание</th></tr></thead><tbody>${facts.map(fact => {
      const rendered = renderValue(fact);
      if (rendered.needsReview) missing.push({ label: fact.label, section: fact.section, reason: rendered.reason });
      const source = fact.sourceCurrent ? sourceLabel(fact.location) : "Актуальность источника требует проверки";
      return `<tr${rendered.needsReview ? ' class="pending"' : ""}><th scope="row">${escapeHtml(fact.label)}${hasText(fact.unit) ? ` <span class="unit">(${escapeHtml(fact.unit)})</span>` : ""}</th><td>${rendered.html}</td><td>${source}${fact.state !== "not_applicable" && hasText(fact.reviewNote) ? `<p class="note">Примечание центра: ${escapeHtml(fact.reviewNote)}</p>` : ""}</td></tr>`;
    }).join("")}</tbody></table>`).join("")}</section>`;
  };
  const factsHtml = renderTable(input.facts, "Сведения о деятельности"), indicatorsHtml = renderTable(input.indicators, "Показатели деятельности");
  const references = input.legalReferences.length ? `<ul>${input.legalReferences.map(reference => {
    const url = primaryUrl(reference.url);
    return `<li>${url ? `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(reference.title)}</a>` : `${escapeHtml(reference.title)} — адрес источника требует проверки`}</li>`;
  }).join("")}</ul>` : "<p>Нужно указать и проверить применимые официальные источники.</p>";
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Черновик самообследования — ${escapeHtml(input.organizationTitle)} — ${input.reportingYear}</title><style>body{font:15px/1.5 Arial,sans-serif;color:#17212b;max-width:1040px;margin:32px auto;padding:0 24px}h1{font-size:24px}h2{font-size:20px;margin-top:28px}h3{font-size:17px}.draft{border:2px solid #a16207;background:#fffbeb;padding:16px}.pending{background:#fffbeb}.note,.unit{font-size:13px;color:#475569}table{width:100%;border-collapse:collapse;margin:12px 0 24px;table-layout:fixed}th,td{border:1px solid #cbd5e1;padding:9px;vertical-align:top;text-align:left;overflow-wrap:anywhere;white-space:pre-wrap}a{color:#0f766e}li{margin-bottom:8px}@media print{body{margin:0;max-width:none;padding:0}table{font-size:11px}tr{break-inside:avoid}.draft{background:transparent}}</style></head><body>
<aside class="draft"><strong>ЧЕРНОВИК. Требуется проверка центра.</strong><p>Документ составлен из предоставленного снимка сведений. Он не подтверждает утверждение отчёта, соответствие требованиям законодательства или публикацию. Проверьте источники, незаполненные позиции и применимость оснований; итог утверждается центром отдельно.</p></aside>
<h1>Отчёт о самообследовании за ${input.reportingYear} год — черновик</h1><p><strong>${escapeHtml(input.organizationTitle)}</strong></p><p>${escapeHtml(input.providerLabel)}</p><p class="note">Снимок сформирован: ${escapeHtml(new Date(input.generatedAt).toISOString())} (UTC). Отчётный год задаётся отдельно от даты формирования.</p>
${hasText(input.legalBasisNote) ? `<section><h2>Основания и применимость</h2><p>${escapeHtml(input.legalBasisNote)}</p></section>` : "<section><h2>Основания и применимость</h2><p class=\"pending\">Нужно проверить правовой статус центра и применимые основания.</p></section>"}
${factsHtml}${indicatorsHtml}<section><h2>Что требуется заполнить или перепроверить</h2>${missing.length ? `<ol>${missing.map(item => `<li><strong>${escapeHtml(item.label)}</strong> (${escapeHtml(item.section)}): ${escapeHtml(item.reason)}.</li>`).join("")}</ol>` : "<p>В переданном снимке нет незаполненных позиций. Проверка содержания и отдельное утверждение центром по-прежнему необходимы.</p>"}</section>
<section><h2>Официальные источники для проверки</h2>${references}<p class="note">Список ссылок не подтверждает действующую редакцию нормы или её применимость к центру.</p></section></body></html>`;
  if (html.length > 12 * 1024 * 1024) return invalid();
  return html;
}
