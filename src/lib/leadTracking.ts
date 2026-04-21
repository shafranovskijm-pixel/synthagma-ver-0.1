/**
 * Захват источника и UTM-меток лида при первом заходе на лендинг.
 * Сохраняется в sessionStorage, чтобы пережить редиректы внутри сайта,
 * и передаётся при сабмите формы (instant- и request-режимы).
 */

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export interface LeadTracking {
  source: string | null;
  utm: Record<string, string>;
  landing_referrer: string | null;
}

/** Вызывается один раз при монтировании страницы лендинга. */
export function captureLeadSource(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of UTM_KEYS) {
      const v = params.get(k);
      if (v) utm[k] = v.slice(0, 100);
    }

    // Сохраняем UTM, только если они в URL (или впервые)
    const hasNewUtm = Object.keys(utm).length > 0;
    const existingUtm = sessionStorage.getItem("lead_utm");

    if (hasNewUtm || !existingUtm) {
      sessionStorage.setItem("lead_utm", JSON.stringify(utm));
    }

    // source: домен реферера (если внешний) или текущий хост
    if (!sessionStorage.getItem("lead_source")) {
      let source = window.location.hostname;
      if (document.referrer) {
        try {
          const refUrl = new URL(document.referrer);
          if (refUrl.hostname && refUrl.hostname !== window.location.hostname) {
            source = refUrl.hostname;
          }
        } catch {
          // ignore
        }
      }
      sessionStorage.setItem("lead_source", source);
      sessionStorage.setItem("lead_referrer", document.referrer || "");
    }
  } catch {
    // sessionStorage может быть недоступен (приватный режим Safari) — молча игнорируем
  }
}

/** Получает накопленные данные для отправки на сервер. */
export function getLeadTracking(): LeadTracking {
  try {
    const utmRaw = sessionStorage.getItem("lead_utm");
    const utm = utmRaw ? JSON.parse(utmRaw) : {};
    return {
      source: sessionStorage.getItem("lead_source"),
      utm: typeof utm === "object" && utm !== null ? utm : {},
      landing_referrer: sessionStorage.getItem("lead_referrer"),
    };
  } catch {
    return { source: null, utm: {}, landing_referrer: null };
  }
}
