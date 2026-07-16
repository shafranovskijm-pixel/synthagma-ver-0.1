const HIDE_BADGE_KEY = "__hide_proxy_badge";
let installed = false;
let hideBadge = true;

function shouldHideFromLocalStorage(): boolean {
  try {
    localStorage.setItem(HIDE_BADGE_KEY, "true");
    return true;
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
    hideBadge = true;
    localStorage.setItem(HIDE_BADGE_KEY, "true");
    removeLegacyProxyBadge();
  } catch {
    // Keep the safe default: hide the legacy badge.
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

  window.addEventListener("sintagma:proxy-badge-visibility", (event) => {
    hideBadge = true;
    try {
      localStorage.setItem(HIDE_BADGE_KEY, "true");
    } catch {
      // ignore
    }
    removeLegacyProxyBadge();
  });

  void refreshHideFlag();
}