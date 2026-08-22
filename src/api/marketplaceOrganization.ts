import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve the platform catalog only by its immutable canonical id. Admin
 * import tools must fail closed when the production migration/backfill has not
 * configured that exact organization as unlimited.
 */
export async function requireCanonicalMarketplaceOrganization(): Promise<string> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, custom_max_courses")
    .eq("id", MARKETPLACE_ORG_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("Каноническая организация магазина не найдена");
  }
  if (data.custom_max_courses !== -1) {
    throw new Error("Для канонической организации магазина не настроен безлимит курсов");
  }

  return MARKETPLACE_ORG_ID;
}
