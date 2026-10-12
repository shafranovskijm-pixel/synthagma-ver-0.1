import { supabase } from "@/integrations/supabase/client";
import { ORG_ROLE_PERMISSIONS, type OrgStaffRole } from "@/constants/rolePermissions";

export type StaffOrganizationResolution =
  | { kind: "owner"; organizationId: string; role: "owner"; sectionsAccess: string[] }
  | { kind: "staff"; organizationId: string; role: OrgStaffRole; sectionsAccess: string[] }
  | { kind: "none"; organizationId: null; role: null; sectionsAccess: string[] };

export class StaffOrganizationResolutionError extends Error {
  constructor(
    public readonly code: "LOAD_FAILED" | "MULTIPLE_ORGANIZATIONS" | "NO_ORGANIZATION",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StaffOrganizationResolutionError";
  }
}

const loadFailure = (cause?: unknown) => new StaffOrganizationResolutionError(
  "LOAD_FAILED", "Не удалось подтвердить доступ к организации. Повторите загрузку.", cause,
);

/**
 * A student's profile organization is their school, not a staff workspace.
 * Keep a confirmed owner's workspace; otherwise use a single active staff
 * membership. Never infer ownership from get_user_role('organization').
 */
export async function resolveStaffOrganization(userId: string): Promise<StaffOrganizationResolution> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw loadFailure(profileError);

    if (profile?.organization_id) {
      const { data: owner, error: ownerError } = await supabase.rpc("is_org_owner", {
        _user_id: userId,
        _organization_id: profile.organization_id,
      });
      if (ownerError || typeof owner !== "boolean") throw loadFailure(ownerError);
      if (owner) return {
        kind: "owner", organizationId: profile.organization_id, role: "owner", sectionsAccess: [],
      };
    }

    const { data: memberships, error: membershipError } = await supabase
      .from("org_staff")
      .select("organization_id, role, sections_access, expires_at")
      .eq("user_id", userId)
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString());
    if (membershipError || !Array.isArray(memberships)) throw loadFailure(membershipError);
    // Check again after the request: a membership can expire while it is in flight.
    const now = Date.now();
    const active = memberships.filter(row => row.expires_at === null || new Date(row.expires_at).getTime() > now);
    if (active.length > 1) throw new StaffOrganizationResolutionError(
      "MULTIPLE_ORGANIZATIONS",
      "У аккаунта есть доступ к нескольким организациям. Автоматически выбрать кабинет нельзя. Обратитесь в поддержку.",
    );
    if (active.length === 0) return { kind: "none", organizationId: null, role: null, sectionsAccess: [] };

    const member = active[0];
    if (!member.organization_id || !Object.prototype.hasOwnProperty.call(ORG_ROLE_PERMISSIONS, member.role)) {
      throw loadFailure();
    }
    return {
      kind: "staff",
      organizationId: member.organization_id,
      role: member.role as OrgStaffRole,
      sectionsAccess: Array.isArray(member.sections_access)
        ? member.sections_access.filter((permission): permission is string => typeof permission === "string")
        : [],
    };
  } catch (error) {
    if (error instanceof StaffOrganizationResolutionError) throw error;
    throw loadFailure(error);
  }
}
