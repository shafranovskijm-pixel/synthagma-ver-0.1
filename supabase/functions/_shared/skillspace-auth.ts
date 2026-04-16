// SkillSpace authentication and API request helpers

export type CookieMap = Map<string, string>;

export function mergeCookiesFromResponse(response: Response, cookieMap: CookieMap) {
  const setCookies: string[] = [];
  if (typeof response.headers.getSetCookie === "function") {
    setCookies.push(...response.headers.getSetCookie());
  } else {
    const raw = response.headers.get("set-cookie");
    if (raw) setCookies.push(raw);
  }
  for (const header of setCookies) {
    const pair = header.split(";")[0].trim();
    const eqIdx = pair.indexOf("=");
    if (eqIdx > 0) {
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      cookieMap.set(name, value);
    }
  }
}

export function getCookieHeader(cookieMap: CookieMap): string {
  return Array.from(cookieMap.entries())
    .filter(([_, v]) => v && v !== "deleted")
    .map(([k, v]) => `${k}=${v}`).join("; ");
}

export function getAuthToken(cookieMap: CookieMap): string | null {
  const t = cookieMap.get("Auth-Token");
  return (t && t !== "deleted") ? t : null;
}

export interface ApiFetchResult {
  ok: boolean;
  status: number;
  data: any;
  raw: string;
}

export function createApiFetch(
  baseUrl: string,
  cookieMap: CookieMap,
  log: (msg: string) => void,
) {
  return async (path: string, maxRetries = 3): Promise<ApiFetchResult> => {
    const headers: Record<string, string> = {
      "Accept": "application/json, text/plain, */*",
      "Cookie": getCookieHeader(cookieMap),
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    };
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch(`${baseUrl}${path}`, { headers });
        const text = await res.text();
        let data = null;
        try { data = JSON.parse(text); } catch { /* not json */ }
        log(`${path} → ${res.status} (${text.length}b)`);
        mergeCookiesFromResponse(res, cookieMap);
        const rawForDebug = text.length < 2000 ? text : "";
        return { ok: res.ok, status: res.status, data, raw: rawForDebug };
      } catch (err) {
        const errStr = String(err);
        const isRetryable = errStr.includes("http2") || errStr.includes("connection error") || errStr.includes("SendRequest");
        if (isRetryable && attempt < maxRetries - 1) {
          const delay = (attempt + 1) * 1000;
          log(`${path} → RETRY ${attempt + 1}/${maxRetries} after ${delay}ms (${errStr.substring(0, 80)})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        log(`${path} → ERROR: ${err}`);
        return { ok: false, status: 0, data: null, raw: "" };
      }
    }
    return { ok: false, status: 0, data: null, raw: "" };
  };
}
