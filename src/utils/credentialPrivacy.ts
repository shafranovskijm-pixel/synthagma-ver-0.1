export interface LegacyLoginPrefill { login: string; password: string }

/** Consume once. The initial inline guard clears the URL before any third-party scripts. */
export function consumeLegacyLoginPrefill(): LegacyLoginPrefill | null {
  const page = window as Window & { __consumeLegacyLoginPrefill?: () => LegacyLoginPrefill | null };
  return page.__consumeLegacyLoginPrefill?.() ?? null;
}

/** Copy credentials separately from the URL, only for personal delivery to the student. */
export function studentCredentialsText(baseUrl: string, login: string, password: string): string {
  return `Вход: ${baseUrl.replace(/\/$/, '')}/login\nЛогин: ${login}\nПароль: ${password}\nПередавайте эти данные только лично ученику.`;
}

export function sanitizeTrackingUrl(raw: string): string {
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.origin);
    url.username = ''; url.password = '';
    const sensitive = /^(u|p|password|passwd|access_token|refresh_token|token|code)$/i;
    for (const key of Array.from(url.searchParams.keys())) {
      if (sensitive.test(key)) url.searchParams.delete(key);
    }
    if (url.hash.includes('=')) {
      const hash = new URLSearchParams(url.hash.slice(1));
      for (const key of Array.from(hash.keys())) if (sensitive.test(key)) hash.delete(key);
      url.hash = hash.toString();
    }
    return url.href;
  } catch { return ''; }
}
