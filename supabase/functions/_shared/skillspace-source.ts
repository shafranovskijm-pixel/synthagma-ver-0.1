// Credential-bearing SkillSpace requests must remain on one school origin.
const schoolHost = /^[a-z0-9-]+\.skillspace\.ru$/;

function isSchoolUrl(url: URL): boolean {
  return url.protocol === "https:" && schoolHost.test(url.hostname)
    && !url.username && !url.password && !url.port;
}

export function parseSkillspaceSource(input: unknown): { baseUrl: string; courseId: string; schoolSlug: string } | null {
  if (typeof input !== "string" || !/^https:\/\//i.test(input.trim()) || /[\u0000-\u001f\u007f\\]/.test(input)) return null;
  try {
    const url = new URL(input.trim());
    if (!isSchoolUrl(url)) return null;
    const course = /^\/course\/(\d+)(?:\/.*)?$/.exec(url.pathname);
    if (!course) return null;
    // A valid course link can contain query/lesson anchors. They never choose
    // the host or course: only the parsed origin and pathname above do so.
    return { baseUrl: url.origin, courseId: course[1], schoolSlug: url.hostname.slice(0, -".skillspace.ru".length) };
  } catch { return null; }
}

export function resolveSkillspaceRedirect(location: string, currentUrl: string, expectedOrigin: string): string | null {
  if (typeof location !== "string" || !location.trim() || /[\u0000-\u001f\u007f\\]/.test(location)) return null;
  try {
    const origin = new URL(expectedOrigin);
    const current = new URL(currentUrl);
    const target = new URL(location, current);
    if (!isSchoolUrl(origin) || !isSchoolUrl(current) || current.origin !== origin.origin
      || !isSchoolUrl(target) || target.origin !== origin.origin) return null;
    target.hash = "";
    return target.href;
  } catch { return null; }
}

// Media can live on public CDNs, but never needs embedded credentials or a
// literal/local network address. This is URL validation, not DNS/rebinding proof.
export function parseSkillspaceMediaUrl(input: string, relativeTo?: string): URL | null {
  if (typeof input !== "string" || /[\u0000-\u001f\u007f\\]/.test(input)) return null;
  try {
    const url = relativeTo ? new URL(input, relativeTo) : new URL(input);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || !hostname.includes(".") || hostname.startsWith("[") || /^[\d.]+$/.test(hostname)
      || /(?:^|\.)(?:localhost|local|internal)$/.test(hostname)) return null;
    url.hash = "";
    return url;
  } catch { return null; }
}
