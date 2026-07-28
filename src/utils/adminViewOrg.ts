import { supabase } from "@/integrations/supabase/client";

const KEY = "adminViewAsOrg";

export interface AdminViewOrg {
  id: string;
  name: string;
}

export type AdminViewResolution =
  | { status: "admin"; view: AdminViewOrg }
  | { status: "not_admin" }
  | { status: "unknown" }
  | { status: "none" };

/** Synchronously read the admin-view flag from localStorage. */
export function readAdminViewOrg(): AdminViewOrg | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && parsed.id) {
      return { id: parsed.id, name: typeof parsed.name === "string" ? parsed.name : "" };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearAdminViewOrg(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Resolve admin-view mode for the given user.
 *
 * IMPORTANT: only remove the localStorage flag on a *confirmed* non-admin
 * response. On network / RPC errors return `unknown` and leave the flag
 * intact — otherwise a transient failure permanently kicks a real admin
 * out of the "view as organization" mode.
 */
export async function resolveAdminViewOrg(userId: string | null | undefined): Promise<AdminViewResolution> {
  const view = readAdminViewOrg();
  if (!view) return { status: "none" };
  if (!userId) return { status: "unknown" };

  try {
    const { data, error } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (error) return { status: "unknown" };
    if (data === true) return { status: "admin", view };
    if (data === false) {
      clearAdminViewOrg();
      return { status: "not_admin" };
    }
    // null / undefined — treat as transient, do NOT delete the flag
    return { status: "unknown" };
  } catch {
    return { status: "unknown" };
  }
}
