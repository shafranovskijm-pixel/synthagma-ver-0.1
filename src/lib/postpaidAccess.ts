import { supabase } from "@/integrations/supabase/client";
import { getPlanInfo, type PlanLimits } from "@/constants/subscriptionPlans";

export interface PostpaidAccessProfile {
  organization_id: string;
  active: boolean;
  billing_mode: "postpaid" | "prepaid";
  limits: { maxCourses: number; maxStudents: number; maxTrainedStudents: number } | null;
  features: { crm: boolean; webinar: boolean; videoserviceplus: boolean; frdoplus: boolean };
  /** Administrative access only. Never a customer confirmation or invoice input. */
  entitlements?: { all_platform_features: boolean };
}

export async function fetchPostpaidAccessProfile(organizationId: string): Promise<PostpaidAccessProfile> {
  const { data, error } = await supabase.rpc("get_postpaid_access_profile" as any, { p_organization_id: organizationId });
  if (error) throw new Error("Не удалось проверить условия постоплаты. Повторите проверку.");
  const profile = data as unknown as PostpaidAccessProfile | null;
  if (!profile || profile.organization_id !== organizationId || typeof profile.active !== "boolean"
    || profile.billing_mode !== (profile.active ? "postpaid" : "prepaid")
    || !profile.features || !["crm", "webinar", "videoserviceplus", "frdoplus"].every(key => typeof profile.features[key as keyof typeof profile.features] === "boolean")
    || (profile.entitlements !== undefined && (!profile.entitlements || typeof profile.entitlements.all_platform_features !== "boolean"))
    || (profile.active && (!profile.limits || profile.limits.maxCourses !== -1 || profile.limits.maxStudents !== -1 || profile.limits.maxTrainedStudents !== -1))) {
    throw new Error("Сервер не подтвердил условия постоплаты. Повторите проверку.");
  }
  return profile;
}

/** A server-confirmed administrative grant never implies billable-addon consent. */
export function hasAllPlatformFeatureGrant(profile: PostpaidAccessProfile | null | undefined): boolean {
  return profile?.active === true && profile.entitlements?.all_platform_features === true;
}

/** Access entitlements are separate from the month-end invoice tier. */
export function postpaidPlanLimits(profile: PostpaidAccessProfile): PlanLimits {
  const allFeatures = hasAllPlatformFeatureGrant(profile);
  return {
    ...getPlanInfo(allFeatures ? "professional" : "start").limits,
    maxCourses: -1,
    maxStudents: -1,
    maxTrainedPerMonth: -1,
    storageBytes: -1,
    salesCrmEnabled: allFeatures || profile.features.crm,
    webinarsEnabled: allFeatures || profile.features.webinar,
    videoServicePlus: allFeatures || profile.features.videoserviceplus,
    // Basic FRDO remains part of Start; the paid FRDO+ category is gated separately.
    emailCampaignsEnabled: true,
  };
}
