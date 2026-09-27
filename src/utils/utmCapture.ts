/**
 * UTM capture utility — saves utm_* params from URL into localStorage
 * so they survive across page navigations within the registration funnel.
 */
import { sanitizeTrackingUrl } from "./credentialPrivacy";

const STORAGE_KEY = "utm_capture_v1";
const TTL_DAYS = 30;

export interface UtmData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  yclid?: string;
  page_url?: string;
  referrer?: string;
  saved_at: number;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const ATTRIBUTION_KEYS = [...UTM_KEYS, "yclid"] as const;

export function captureUtmFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const found: Partial<UtmData> = {};
    let hasAny = false;
    for (const k of ATTRIBUTION_KEYS) {
      const v = params.get(k);
      if (v) {
        found[k] = v.slice(0, 128);
        hasAny = true;
      }
    }
    if (!hasAny) {
      // First visit without UTM → still capture referrer/landing page if not set yet
      const existing = getUtmData();
      if (existing) return;
      const ref = sanitizeTrackingUrl(document.referrer);
      if (!ref || ref.includes(window.location.host)) return;
      found.referrer = ref.slice(0, 1024);
      found.page_url = sanitizeTrackingUrl(window.location.href).slice(0, 1024);
    } else {
      found.page_url = sanitizeTrackingUrl(window.location.href).slice(0, 1024);
      found.referrer = document.referrer ? sanitizeTrackingUrl(document.referrer).slice(0, 1024) : undefined;
    }
    found.saved_at = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(found));
  } catch (e) {
    console.warn("captureUtmFromUrl failed");
  }
}

export function getUtmData(): UtmData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UtmData;
    if (Date.now() - (parsed.saved_at || 0) > TTL_DAYS * 86400_000) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const cleaned = {
      ...parsed,
      ...(parsed.page_url ? { page_url: sanitizeTrackingUrl(parsed.page_url) } : {}),
      ...(parsed.referrer ? { referrer: sanitizeTrackingUrl(parsed.referrer) } : {}),
    };
    // Also repair old browser-local attribution before it can be sent to a lead record.
    if (cleaned.page_url !== parsed.page_url || cleaned.referrer !== parsed.referrer) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return null;
  }
}

export function clearUtmData() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn("clearUtmData failed:", error);
  }
}
