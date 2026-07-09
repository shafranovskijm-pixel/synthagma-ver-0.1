// Builds the deterministic auth-email used for login-based student accounts.
// Latin/ASCII logins keep the classic `${login}@student.local` shape so that
// existing users continue to sign in without any data migration. Non-ASCII
// logins (e.g. Cyrillic) get a stable ASCII fallback derived from a SHA-256
// hash of the lowercased login, so Supabase Auth (which requires ASCII in
// email addresses) always receives a valid value.
export async function buildAuthEmail(login: string): Promise<string> {
  const clean = login.trim().toLowerCase();
  if (/^[a-z0-9._-]+$/.test(clean)) {
    return `${clean}@student.local`;
  }
  const bytes = new TextEncoder().encode(clean);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `u_${hex.slice(0, 24)}@student.local`;
}
