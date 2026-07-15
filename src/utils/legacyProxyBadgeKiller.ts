const HIDE_BADGE_KEY = "__hide_proxy_badge";
const SETTINGS_KEY = "hide_proxy_badge";

let installed = false;
let hideBadge = true;

function getBackendConfig() {
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL || "") as string;
  const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "") as string;
  return { baseUrl, publishableKey };
}

function getSettingsUrl(): string | null {
  const { baseUrl } = getBackendConfig();
  if (!baseUrl) return null;

  const query = `/rest/v1/app_settings?setting_key=eq.${SETTINGS_KEY}&select=setting_value`;
  const isCyrillicDomain =
    window.location.hostname === "xn--80aaiswd0ak.xn--p1ai" ||
    window.location.hostname === "www.xn--80aaiswd0ak.xn--p1ai";

  if (isCyrillicDomain) {
    return `https://api.xn--80aaiswd0ak.xn--p1ai/sb-api${query}`;
  }

  return `${baseUrl}${query}`;
}

function shouldHideFromLocalStorage(): boolean {
  try {
    return localStorage.getItem(HIDE_BADGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function isLegacyProxyBadgeCandidate(node: Element): boolean {
  const text = (node.textContent || "").trim();
  if (text !== "Резервный канал") return false;

  const className = String((node as HTMLElement).className || "");
  if (className.includes("fixed") && className.includes("bottom-")) return true;

  return Boolean(node.closest('[class*="fixed"][class*="bottom-"]'));
}

function removeLegacyProxyBadge(): void {
  if (!hideBadge || typeof document === "undefined") return;

  try {
    document.querySelectorAll("body *").forEach((node) => {
      if (!isLegacyProxyBadgeCandidate(node)) return;
      const badge = node.closest('[class*="fixed"][class*="bottom-"]') || node.closest("div,button,a");
      badge?.remove();
    });
  } catch {
    // Best-effort legacy cleanup only.
  }
}

async function refreshHideFlag(): Promise<void> {
  try {
    const { publishableKey } = getBackendConfig();
    const settingsUrl = getSettingsUrl();
    if (!publishableKey || !settingsUrl) return;

    const response = await fetch(settingsUrl, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
      },
      cache: "no-store",
    });
    if (!response.ok) return;

    const rows = await response.json();
    const value = rows?.[0]?.setting_value?.value;
    hideBadge = value !== false;
    localStorage.setItem(HIDE_BADGE_KEY, hideBadge ? "true" : "false");
    removeLegacyProxyBadge();
  } catch {
    // If settings are unreachable, keep the safe default: hide the legacy badge.
  }
}

export function installLegacyProxyBadgeKiller(): void {
  if (installed || typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;
  hideBadge = shouldHideFromLocalStorage();

  removeLegacyProxyBadge();

  const observer = new MutationObserver(() => removeLegacyProxyBadge());
  const startObserver = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true });
    removeLegacyProxyBadge();
  };

  if (document.body) startObserver();
  else document.addEventListener("DOMContentLoaded", startObserver, { once: true });

  window.addEventListener("storage", (event) => {
    if (event.key !== HIDE_BADGE_KEY) return;
    hideBadge = shouldHideFromLocalStorage();
    removeLegacyProxyBadge();
  });

  void refreshHideFlag();
}