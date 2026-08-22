import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETPLACE_ORG_ID } from "@/constants/marketplace";
import { SUBSCRIPTION_PLANS } from "@/constants/subscriptionPlans";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read(
  "supabase/migrations/20260822162000_harden_unified_course_quota.sql",
);
const profileIdentityMigration = read(
  "supabase/migrations/20260822162500_guard_profile_tenant_identity.sql",
);
const purchaseApi = read("src/api/marketplacePurchase.ts");
const purchaseHook = read("src/hooks/useCourseStoreManager.ts");
const storeFetch = read("src/hooks/useCourseStoreFetch.ts");
const canonicalHelper = read("src/api/marketplaceOrganization.ts");
const bulkImporter = read("src/components/admin/BulkCourseImporter.tsx");
const adminMarketplace = read("src/hooks/useAdminMarketplace.ts");
const contentGenerator = read("src/hooks/useContentGenerator.ts");
const sidebar = read("src/components/organization/OrgSidebar.tsx");

function sqlFunctionBody(functionName: string, source = migration): string {
  const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${escapedName}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,
  ));
  expect(match, `missing SQL body for ${functionName}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("unified marketplace and course quota security contract", () => {
  it("backfills only the immutable canonical marketplace tenant as unlimited", () => {
    expect(migration).toContain(`WHERE id = '${MARKETPLACE_ORG_ID}'::uuid`);
    expect(migration).toMatch(/SET custom_max_courses = -1/);
    expect(migration).not.toMatch(/WHERE\s+name\s*=/i);
    expect(migration).toContain("Canonical marketplace organization is missing");

    for (const source of [canonicalHelper, bulkImporter, adminMarketplace, contentGenerator]) {
      expect(source).not.toContain('.eq("name", "Платформа Синтагма")');
    }
    expect(canonicalHelper).toContain('.eq("id", MARKETPLACE_ORG_ID)');
    expect(canonicalHelper).toContain("data.custom_max_courses !== -1");
    expect(bulkImporter).toContain("requireCanonicalMarketplaceOrganization()");
  });

  it("applies the same serialized quota to inserts and cross-tenant moves", () => {
    const body = sqlFunctionBody("enforce_course_insert_limit");
    const organizationAt = body.indexOf("FROM public.organizations");
    const advisoryAt = body.indexOf("pg_advisory_xact_lock");
    const countAt = body.indexOf("FROM public.courses");

    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OF organization_id ON public\.courses/,
    );
    expect(body).toContain(
      "NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id",
    );
    expect(organizationAt).toBeLessThan(advisoryAt);
    expect(advisoryAt).toBeLessThan(countAt);
    expect(body).not.toContain("service_role");
  });

  it("normalizes public organization inserts and protects every entitlement column", () => {
    const body = sqlFunctionBody("guard_organization_course_quota_config");
    const updateTrigger = migration.match(
      /CREATE TRIGGER guard_organization_course_quota_config\s+BEFORE UPDATE OF([\s\S]*?)ON public\.organizations/,
    )?.[1] ?? "";
    const protectedColumns = [
      "subscription_plan",
      "custom_max_courses",
      "custom_max_students",
      "custom_max_trained_per_month",
      "custom_ai_generations_limit",
      "custom_storage_limit_bytes",
      "is_paid",
      "paid_until",
      "tariff_type",
      "monthly_price",
      "tariff_custom_label",
      "custom_price",
      "custom_discount",
      "storage_limit_bytes",
      "ai_tokens_limit",
      "enabled_features",
      "custom_enabled_categories",
      "ai_enabled",
      "frdo_enabled",
    ];

    for (const column of protectedColumns) {
      expect(updateTrigger, `missing protected organization column ${column}`)
        .toMatch(new RegExp(`\\b${column}\\b`));
      expect(body).toContain(`NEW.${column}`);
      expect(body).toContain(`OLD.${column}`);
    }

    expect(migration).toMatch(
      /CREATE TRIGGER guard_organization_course_quota_config_insert\s+BEFORE INSERT\s+ON public\.organizations/,
    );
    expect(body).toContain("TG_OP = 'INSERT'");
    expect(body).toContain("NEW.subscription_plan := 'free'");
    expect(body).toContain("NEW.custom_max_courses := NULL");
    expect(body).toContain("NEW.storage_limit_bytes := 104857600");
    expect(body).toContain("NEW.ai_tokens_limit := 100000");
    expect(body).toContain("NEW.enabled_features := '[]'::jsonb");
    expect(body).toContain("NEW.custom_enabled_categories := '{}'::text[]");
    expect(body).toContain(`NEW.ai_enabled := ${SUBSCRIPTION_PLANS.free.limits.aiEnabled}`);
    expect(body).toContain(`NEW.frdo_enabled := ${SUBSCRIPTION_PLANS.free.limits.frdoEnabled}`);
    expect(SUBSCRIPTION_PLANS.free.limits.storageBytes).toBe(104857600);
    expect(body).toContain("auth.role() = 'service_role'");
    expect(body).toContain(
      "public.has_role('admin'::public.app_role, auth.uid())",
    );
    expect(body).not.toContain(
      "public.has_role(auth.uid(), 'admin'::public.app_role)",
    );
    expect(body).toContain("session_user IN ('postgres', 'supabase_admin')");
    expect(body).toContain("ERRCODE = '42501'");
  });

  it("prevents browser clients from minting marketplace balance", () => {
    const body = sqlFunctionBody("guard_organization_balance");
    const purchaseBody = sqlFunctionBody("purchase_marketplace_course");

    expect(migration).toMatch(
      /CREATE TRIGGER guard_organization_balance_update\s+BEFORE UPDATE OF balance\s+ON public\.organizations/,
    );
    expect(migration).toMatch(
      /CREATE TRIGGER guard_organization_balance_insert\s+BEFORE INSERT\s+ON public\.organizations/,
    );
    expect(body).toContain("NEW.balance < 0");
    expect(body).toContain("auth.role() = 'service_role'");
    expect(body).toContain(
      "public.has_role('admin'::public.app_role, auth.uid())",
    );
    expect(body).toContain("current_user IN ('postgres', 'supabase_admin')");
    expect(body).toContain("ERRCODE = '42501'");
    expect(purchaseBody).toMatch(
      /UPDATE public\.organizations\s+SET balance = balance - v_price/,
    );
  });

  it("keeps order, balance debit and complete course delivery atomic", () => {
    const body = sqlFunctionBody("purchase_marketplace_course");
    const orderAt = body.indexOf("INSERT INTO public.marketplace_orders");
    const debitAt = body.indexOf("INSERT INTO public.balance_transactions");
    const courseAt = body.indexOf("INSERT INTO public.courses");
    const documentsAt = body.indexOf("INSERT INTO public.course_documents");
    const attachmentsAt = body.indexOf("INSERT INTO public.lesson_attachments");
    const paidAt = body.indexOf("SET status = 'paid', paid_at = now()");

    expect(orderAt).toBeGreaterThanOrEqual(0);
    expect(debitAt).toBeGreaterThan(orderAt);
    expect(courseAt).toBeGreaterThan(debitAt);
    expect(documentsAt).toBeGreaterThan(courseAt);
    expect(body).toContain("FOR UPDATE");
    expect(body).toMatch(
      /mc\.is_active = true\s+AND mc\.is_validated = true/,
    );
    expect(body).toContain("v_balance < v_price");
    expect(body).toContain("v_price := v_listing.price_organization");
    expect(body).toContain("INSERT INTO public.course_modules");
    expect(body).toContain("INSERT INTO public.lessons");
    expect(body).toContain("INSERT INTO public.test_questions");
    expect(body).toContain("INSERT INTO public.lesson_attachments");
    expect(body).toMatch(
      /INSERT INTO public\.course_documents\s*\(\s*course_id,\s*name,\s*type,\s*description,\s*file_url/,
    );
    expect(body).toContain("v_module_map ? v_lesson.module_id::text");
    expect(body).toContain("references a module outside the source course");
    expect(migration).toContain(
      "module_access_schedules/module_access_overrides are intentionally reset",
    );
    expect(body).toMatch(/'pending',[\s\S]*?RETURNING id INTO v_order_id/);
    expect(paidAt).toBeGreaterThan(attachmentsAt);
    expect(body).not.toMatch(/EXCEPTION\s+WHEN/);
    expect(body).toMatch(/v_source\.skip_video_identification,\s+NULL,\s+v_source\.id/);
    expect(body).toContain(
      "v_listing.organization_id IS DISTINCT FROM v_source.organization_id",
    );
    expect(body).not.toContain("v_source.completion_notify_emails");
    expect(body).toContain("Extra notification recipients belong to the seller tenant");
  });

  it("blocks direct orders, financial rewrites and invalid seller transitions", () => {
    const deliveryBody = sqlFunctionBody("guard_marketplace_order_delivery");
    const immutableBody = sqlFunctionBody("guard_marketplace_order_immutable_fields");

    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Buyers can create orders" ON public.marketplace_orders',
    );
    expect(migration).toContain(
      "REVOKE INSERT ON public.marketplace_orders FROM anon, authenticated",
    );
    expect(deliveryBody).toContain("NEW.status IN ('paid', 'completed')");
    expect(deliveryBody).toContain("NEW.paid_at IS NULL");
    expect(deliveryBody).toContain("c.source_order_id = NEW.id");
    expect(deliveryBody).toContain("c.organization_id = NEW.buyer_organization_id");
    expect(deliveryBody).toContain("c.source_course_id = mc.course_id");
    expect(deliveryBody).toContain("ERRCODE = '23514'");
    for (const column of [
      "marketplace_course_id",
      "buyer_user_id",
      "buyer_organization_id",
      "buyer_type",
      "price",
      "students_count",
      "notes",
      "payment_method",
      "paid_at",
      "created_at",
    ]) {
      expect(immutableBody).toContain(`NEW.${column}`);
      expect(immutableBody).toContain(`OLD.${column}`);
    }
    expect(immutableBody).toContain(
      "OLD.status = 'paid' AND NEW.status NOT IN ('paid', 'completed')",
    );
    expect(immutableBody).toContain(
      "OLD.status = 'completed' AND NEW.status <> 'completed'",
    );
    expect(immutableBody).toContain(
      "OLD.status = 'pending' AND NEW.status IN ('approved', 'cancelled')",
    );
    expect(immutableBody).toContain(
      "OLD.status = 'paid' AND NEW.status = 'completed'",
    );
    expect(immutableBody).toContain("AND NOT v_trusted");
  });

  it("enforces source ownership and admin-only validation, then invalidates edits", () => {
    const tenantBody = sqlFunctionBody("guard_marketplace_course_tenant");
    const validationBody = sqlFunctionBody("guard_marketplace_course_validation");
    const invalidationBody = sqlFunctionBody("invalidate_marketplace_course_validation");

    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OF course_id, organization_id\s+ON public\.marketplace_courses/,
    );
    expect(tenantBody).toContain("NEW.organization_id IS DISTINCT FROM v_source_organization_id");
    expect(tenantBody).toContain(`'${MARKETPLACE_ORG_ID}'::uuid`);
    expect(migration).toMatch(
      /BEFORE INSERT OR UPDATE OF is_validated, course_id\s+ON public\.marketplace_courses/,
    );
    expect(validationBody).toContain("NEW.is_validated IS NOT TRUE");
    expect(validationBody).toContain(
      "NEW.course_id IS DISTINCT FROM OLD.course_id",
    );
    expect(validationBody).toContain("NEW.is_validated := false");
    expect(validationBody).toContain(
      "public.has_role('admin'::public.app_role, auth.uid())",
    );
    expect(validationBody).toContain("current_user IN ('postgres', 'supabase_admin')");
    expect(invalidationBody).toMatch(
      /UPDATE public\.marketplace_courses mc\s+SET is_validated = false/,
    );
    for (const table of [
      "courses",
      "course_modules",
      "lessons",
      "test_questions",
      "lesson_attachments",
      "course_documents",
    ]) {
      expect(migration, `missing validation invalidation for ${table}`).toMatch(
        new RegExp(`AFTER (?:UPDATE|INSERT OR UPDATE OR DELETE) ON public\\.${table}`),
      );
    }
    expect(invalidationBody).toContain("IF TG_OP = 'DELETE' THEN");
    expect(invalidationBody).toContain("RETURN OLD");
  });

  it("protects tenant/group identity without breaking authorized student assignment", () => {
    const body = sqlFunctionBody(
      "guard_profile_tenant_identity",
      profileIdentityMigration,
    );
    const header = profileIdentityMigration.match(
      /CREATE OR REPLACE FUNCTION public\.guard_profile_tenant_identity\(\)([\s\S]*?)AS \$function\$/,
    )?.[1] ?? "";

    expect(profileIdentityMigration).toMatch(
      /BEFORE UPDATE OF organization_id, company_id, student_group_id\s+ON public\.profiles/,
    );
    expect(header).not.toContain("SECURITY DEFINER");
    expect(body).toContain(
      "NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id",
    );
    expect(body).toContain("NEW.company_id IS NOT DISTINCT FROM OLD.company_id");
    expect(body).toContain(
      "NEW.student_group_id IS NOT DISTINCT FROM OLD.student_group_id",
    );
    expect(body).toContain("auth.role() = 'service_role'");
    expect(body).toContain(
      "public.has_role('admin'::public.app_role, auth.uid())",
    );
    expect(body).not.toContain(
      "public.has_role(auth.uid(), 'admin'::public.app_role)",
    );
    expect(body).toContain("current_user IN ('postgres', 'supabase_admin')");
    expect(body).toContain(
      "public.can_access_organization(OLD.organization_id, 'students.write')",
    );
    expect(body).toContain("c.organization_id = OLD.organization_id");
    expect(body).toContain("g.organization_id = OLD.organization_id");
    expect(body).toContain("ERRCODE = '42501'");
    expect(profileIdentityMigration).not.toContain("DROP POLICY");
  });

  it("uses the RPC from the browser and leaves the store visibly Beta", () => {
    expect(purchaseApi).toContain('supabase.rpc("purchase_marketplace_course"');
    expect(purchaseHook).toContain("purchaseMarketplaceCourse({");
    expect(purchaseHook).not.toContain("from('marketplace_orders').insert");
    expect(purchaseHook).not.toContain("Error cloning course");
    expect(storeFetch).toMatch(
      /\.eq\('is_active', true\)\s+\.eq\('is_validated', true\)/,
    );
    expect(migration).toContain(
      "USING (is_active = true AND is_validated = true)",
    );
    expect(sidebar).toMatch(/id: "services"[\s\S]*?statusBadge: "Beta"/);
  });
});
