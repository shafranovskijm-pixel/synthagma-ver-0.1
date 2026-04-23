/**
 * Helpers for the "Admin views as Student" mode.
 *
 * When an admin or organization manager presses "Войти как ученик" on a student
 * card, we save `{ userId, name, orgReturn? }` in localStorage under the key
 * `adminViewAsStudent`. The student dashboard and the course learning screen
 * use this to render data of the target student instead of the logged-in user.
 *
 * Importantly, while in this mode we MUST NOT write any progress, attempts, or
 * access logs to the database — admin is just looking at the student's view.
 */

const STORAGE_KEY = "adminViewAsStudent";

export interface AdminViewData {
  userId: string;
  name: string;
  orgReturn?: string;
  orgName?: string;
}

/**
 * Reads the admin-view payload from localStorage.
 * Returns null if missing, malformed, or if it lacks a userId.
 *
 * NOTE: We don't verify the actual role here — that check happens server-side
 * via RLS (only real admins/org managers can SELECT the target student's data).
 * The flag itself is just a UI hint.
 */
export function getAdminViewData(): AdminViewData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.userId !== "string" || !parsed.userId) {
      // Malformed — clean up so we don't show the banner indefinitely.
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      userId: parsed.userId,
      name: typeof parsed.name === "string" ? parsed.name : "",
      orgReturn: typeof parsed.orgReturn === "string" ? parsed.orgReturn : undefined,
      orgName: typeof parsed.orgName === "string" ? parsed.orgName : undefined,
    };
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    return null;
  }
}

/** Convenience boolean for the most common check. */
export function isAdminViewActive(): boolean {
  return getAdminViewData() !== null;
}

/** Clears the admin-view flag (used by the "Выйти" button). */
export function clearAdminView(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
