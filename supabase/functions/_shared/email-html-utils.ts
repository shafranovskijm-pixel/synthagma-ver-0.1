// Утилиты обработки HTML рассылок: UTM-метки, click-tracking, footer отписки

export interface RewriteOptions {
  campaignId: string;
  campaignName: string;
  recipientToken: string;          // open_token получателя
  supabaseUrl: string;             // base URL edge functions
  utmEnabled: boolean;
  utmCampaign?: string;
  trackClicks?: boolean;           // оборачивать ссылки в click-redirect
  unsubscribeUrl: string;          // готовая ссылка отписки для футера
  fromEmail: string;               // для футера "ответьте СТОП"
}

const SAFE_URL_PROTOCOLS = /^(https?:|mailto:|tel:)/i;
const ABSOLUTE_HTTP = /^https?:\/\//i;

/**
 * Добавляет UTM-метки к http(s)-URL, не дублируя существующие.
 */
export function addUtm(rawUrl: string, campaign: string): string {
  if (!ABSOLUTE_HTTP.test(rawUrl)) return rawUrl;
  try {
    const u = new URL(rawUrl);
    if (!u.searchParams.has("utm_source")) u.searchParams.set("utm_source", "sintagma");
    if (!u.searchParams.has("utm_medium")) u.searchParams.set("utm_medium", "email");
    if (!u.searchParams.has("utm_campaign")) u.searchParams.set("utm_campaign", campaign);
    return u.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Оборачивает URL в click-tracking редирект.
 */
export function wrapClickTracking(rawUrl: string, opts: RewriteOptions): string {
  if (!ABSOLUTE_HTTP.test(rawUrl)) return rawUrl;
  // не трекаем сам unsubscribe / pixel / mailto
  if (rawUrl.includes("/email-unsubscribe") || rawUrl.includes("/track-email-open")) return rawUrl;
  const u = `${opts.supabaseUrl}/functions/v1/email-click-redirect?t=${opts.recipientToken}&u=${encodeURIComponent(rawUrl)}`;
  return u;
}

/**
 * Главная функция: переписывает все href в HTML тела письма.
 */
export function processCampaignHtml(html: string, opts: RewriteOptions): string {
  const utmCampaign = (opts.utmCampaign || opts.campaignName || opts.campaignId)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .slice(0, 60);

  // Заменяем href="..." и src="..." (для href — только http(s); src не трогаем)
  const rewritten = html.replace(/href\s*=\s*"([^"]+)"/gi, (m, url) => {
    if (!SAFE_URL_PROTOCOLS.test(url)) return m;
    let finalUrl = url;
    if (opts.utmEnabled && ABSOLUTE_HTTP.test(finalUrl)) {
      finalUrl = addUtm(finalUrl, utmCampaign);
    }
    if (opts.trackClicks && ABSOLUTE_HTTP.test(finalUrl)) {
      finalUrl = wrapClickTracking(finalUrl, { ...opts, utmCampaign });
    }
    return `href="${finalUrl}"`;
  });

  // Footer с отпиской (для соответствия закону / снижения спам-жалоб)
  const footer = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center">
  <tr><td>
    Вы получили это письмо, потому что подписаны на рассылку Sintagma или указали свой email на нашем сайте.<br>
    <a href="${opts.unsubscribeUrl}" style="color:#1AAB9B;text-decoration:underline">Отписаться от рассылки</a>
    &nbsp;·&nbsp;
    Или ответьте письмом со словом <b>СТОП</b> на адрес ${opts.fromEmail}
  </td></tr>
</table>`;

  return rewritten + footer;
}

/** Простая валидация HTML — поиск незакрытых популярных тегов */
export function validateHtml(html: string): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const tags = ["div", "p", "span", "a", "table", "tr", "td", "h1", "h2", "h3", "ul", "ol", "li"];
  for (const t of tags) {
    const open = (html.match(new RegExp(`<${t}\\b[^>]*>`, "gi")) || []).length;
    const close = (html.match(new RegExp(`</${t}>`, "gi")) || []).length;
    if (open !== close) {
      warnings.push(`<${t}>: открытий ${open}, закрытий ${close}`);
    }
  }
  return { valid: warnings.length === 0, warnings };
}
