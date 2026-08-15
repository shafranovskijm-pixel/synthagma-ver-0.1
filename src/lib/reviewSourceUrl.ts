const REVIEW_SOURCE_HOST_ALLOWLIST = new Set([
  "publication.pravo.gov.ru",
]);

const DEFAULT_SOURCE_LABEL = "Официальный источник";

export interface ReviewSourceLink {
  href: string;
  label: string;
}

export function getAllowedReviewSourceUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || (url.port && url.port !== "443")
      || !REVIEW_SOURCE_HOST_ALLOWLIST.has(url.hostname)
    ) {
      return null;
    }

    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

export function getReviewSourceLink(
  sourceUrl: unknown,
  sourceLabel: unknown,
): ReviewSourceLink | null {
  const href = getAllowedReviewSourceUrl(sourceUrl);
  if (!href) return null;

  const normalizedLabel = typeof sourceLabel === "string"
    ? Array.from(sourceLabel, (character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127 ? " " : character;
      }).join("").trim().slice(0, 160)
    : "";

  return {
    href,
    label: normalizedLabel || DEFAULT_SOURCE_LABEL,
  };
}
