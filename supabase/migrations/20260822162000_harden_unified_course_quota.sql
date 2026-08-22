-- Close every remaining course-quota bypass at the database boundary and
-- make an organization marketplace purchase/order/course clone one atomic
-- transaction.

-- The platform marketplace organization is a stable, code-level identity.
-- It is the only system catalog tenant and is intentionally unlimited.
DO $block$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.organizations
  SET custom_max_courses = -1
  WHERE id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Canonical marketplace organization is missing'
      USING ERRCODE = 'P0002';
  END IF;
END
$block$;

-- Re-define the table-boundary gate so moving a course to another tenant is
-- checked exactly like creating it there. Service-role writes intentionally
-- pass through the same quota; unlimited behavior is data-driven through
-- custom_max_courses = -1 on the canonical marketplace tenant above.
CREATE OR REPLACE FUNCTION public.enforce_course_insert_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_plan text;
  v_custom_max integer;
  v_max_courses integer;
  v_current_courses integer;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id
  THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required for course creation'
      USING ERRCODE = '23502';
  END IF;

  -- Keep the tariff row stable and use the same row -> advisory -> count lock
  -- order as every other course creation path.
  SELECT COALESCE(subscription_plan, 'free'), custom_max_courses
    INTO v_plan, v_custom_max
  FROM public.organizations
  WHERE id = NEW.organization_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('course-limit:' || NEW.organization_id::text, 0)
  );

  v_max_courses := COALESCE(
    v_custom_max,
    CASE v_plan
      WHEN 'free' THEN 3
      WHEN 'start' THEN 15
      WHEN 'standard' THEN 30
      WHEN 'professional' THEN -1
      WHEN 'maximum' THEN -1
      ELSE 3
    END
  );

  IF v_max_courses <> -1 THEN
    SELECT count(*)::integer
      INTO v_current_courses
    FROM public.courses
    WHERE organization_id = NEW.organization_id;

    IF v_current_courses >= GREATEST(v_max_courses, 0) THEN
      RAISE EXCEPTION 'maximum course limit reached'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_course_insert_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_course_insert_limit() FROM anon;

DROP TRIGGER IF EXISTS enforce_course_insert_limit ON public.courses;
CREATE TRIGGER enforce_course_insert_limit
BEFORE INSERT OR UPDATE OF organization_id ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_course_insert_limit();

-- settings.write grants access to organization settings, not billing/quota
-- administration. The public INSERT policy must not become an alternate way
-- to create an unlimited tenant either. Only a platform admin, a service-role
-- payment/registration workflow, or a trusted direct database session may set
-- non-default quota-driving fields.
CREATE OR REPLACE FUNCTION public.guard_organization_course_quota_config()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.role() = 'service_role'
       OR public.has_role('admin'::public.app_role, auth.uid())
       OR session_user IN ('postgres', 'supabase_admin')
    THEN
      RETURN NEW;
    END IF;

    -- Public registration may provide ordinary profile/requisite fields, but
    -- never billing, quota or feature entitlements. Normalize those fields to
    -- the canonical free-plan baseline instead of trusting request columns.
    NEW.subscription_plan := 'free';
    NEW.custom_max_courses := NULL;
    NEW.custom_max_students := NULL;
    NEW.custom_max_trained_per_month := NULL;
    NEW.custom_ai_generations_limit := NULL;
    NEW.custom_storage_limit_bytes := NULL;
    NEW.is_paid := false;
    NEW.paid_until := NULL;
    NEW.tariff_type := 'free';
    NEW.monthly_price := 0;
    NEW.tariff_custom_label := NULL;
    NEW.custom_price := NULL;
    NEW.custom_discount := NULL;
    NEW.storage_limit_bytes := 104857600;
    NEW.ai_tokens_limit := 100000;
    NEW.enabled_features := '[]'::jsonb;
    NEW.custom_enabled_categories := '{}'::text[];
    NEW.ai_enabled := true;
    NEW.frdo_enabled := true;
    RETURN NEW;
  END IF;

  IF NEW.subscription_plan IS NOT DISTINCT FROM OLD.subscription_plan
     AND NEW.custom_max_courses IS NOT DISTINCT FROM OLD.custom_max_courses
     AND NEW.custom_max_students IS NOT DISTINCT FROM OLD.custom_max_students
     AND NEW.custom_max_trained_per_month IS NOT DISTINCT FROM OLD.custom_max_trained_per_month
     AND NEW.custom_ai_generations_limit IS NOT DISTINCT FROM OLD.custom_ai_generations_limit
     AND NEW.custom_storage_limit_bytes IS NOT DISTINCT FROM OLD.custom_storage_limit_bytes
     AND NEW.is_paid IS NOT DISTINCT FROM OLD.is_paid
     AND NEW.paid_until IS NOT DISTINCT FROM OLD.paid_until
     AND NEW.tariff_type IS NOT DISTINCT FROM OLD.tariff_type
     AND NEW.monthly_price IS NOT DISTINCT FROM OLD.monthly_price
     AND NEW.tariff_custom_label IS NOT DISTINCT FROM OLD.tariff_custom_label
     AND NEW.custom_price IS NOT DISTINCT FROM OLD.custom_price
     AND NEW.custom_discount IS NOT DISTINCT FROM OLD.custom_discount
     AND NEW.storage_limit_bytes IS NOT DISTINCT FROM OLD.storage_limit_bytes
     AND NEW.ai_tokens_limit IS NOT DISTINCT FROM OLD.ai_tokens_limit
     AND NEW.enabled_features IS NOT DISTINCT FROM OLD.enabled_features
     AND NEW.custom_enabled_categories IS NOT DISTINCT FROM OLD.custom_enabled_categories
     AND NEW.ai_enabled IS NOT DISTINCT FROM OLD.ai_enabled
     AND NEW.frdo_enabled IS NOT DISTINCT FROM OLD.frdo_enabled
  THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role'
     OR public.has_role('admin'::public.app_role, auth.uid())
     OR session_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only platform billing administrators may change organization entitlements'
    USING ERRCODE = '42501';
END
$function$;

REVOKE ALL ON FUNCTION public.guard_organization_course_quota_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_organization_course_quota_config() FROM anon;

DROP TRIGGER IF EXISTS guard_organization_course_quota_config
  ON public.organizations;
CREATE TRIGGER guard_organization_course_quota_config
BEFORE UPDATE OF
  subscription_plan,
  custom_max_courses,
  custom_max_students,
  custom_max_trained_per_month,
  custom_ai_generations_limit,
  custom_storage_limit_bytes,
  is_paid,
  paid_until,
  tariff_type,
  monthly_price,
  tariff_custom_label,
  custom_price,
  custom_discount,
  storage_limit_bytes,
  ai_tokens_limit,
  enabled_features,
  custom_enabled_categories,
  ai_enabled,
  frdo_enabled
ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.guard_organization_course_quota_config();

DROP TRIGGER IF EXISTS guard_organization_course_quota_config_insert
  ON public.organizations;
CREATE TRIGGER guard_organization_course_quota_config_insert
BEFORE INSERT
ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.guard_organization_course_quota_config();

-- Organization settings access also used to include the account balance.
-- A normal RLS-authorized profile must never be able to mint marketplace
-- funds. SECURITY DEFINER billing functions execute their SQL as the function
-- owner (`current_user`), while the direct PostgREST caller remains the
-- authenticated role, so that distinction safely permits the atomic debit.
CREATE OR REPLACE FUNCTION public.guard_organization_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.balance < 0 THEN
    RAISE EXCEPTION 'Organization balance cannot be negative'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.balance = 0 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.balance IS NOT DISTINCT FROM OLD.balance THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role'
     OR public.has_role('admin'::public.app_role, auth.uid())
     OR current_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only trusted billing processes may change organization balance'
    USING ERRCODE = '42501';
END
$function$;

REVOKE ALL ON FUNCTION public.guard_organization_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_organization_balance() FROM anon;

DROP TRIGGER IF EXISTS guard_organization_balance_insert
  ON public.organizations;
CREATE TRIGGER guard_organization_balance_insert
BEFORE INSERT
ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.guard_organization_balance();

DROP TRIGGER IF EXISTS guard_organization_balance_update
  ON public.organizations;
CREATE TRIGGER guard_organization_balance_update
BEFORE UPDATE OF balance
ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.guard_organization_balance();

-- A paid/completed marketplace order must already have its delivered course.
-- The purchase RPC below creates an internal pending row first and marks it
-- paid only after the full clone succeeds.
CREATE OR REPLACE FUNCTION public.guard_marketplace_order_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.status IN ('paid', 'completed') AND NEW.paid_at IS NULL THEN
    RAISE EXCEPTION 'Settled marketplace order requires a payment timestamp'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('paid', 'completed')
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM NEW.status
     )
     AND NOT EXISTS (
       SELECT 1
        FROM public.courses c
        JOIN public.marketplace_courses mc
          ON mc.id = NEW.marketplace_course_id
        WHERE c.source_order_id = NEW.id
          AND c.organization_id = NEW.buyer_organization_id
          AND c.source_course_id = mc.course_id
      )
  THEN
    RAISE EXCEPTION 'Paid marketplace order requires a delivered course'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_marketplace_order_delivery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_marketplace_order_delivery() FROM anon;

DROP TRIGGER IF EXISTS guard_marketplace_order_delivery
  ON public.marketplace_orders;
CREATE TRIGGER guard_marketplace_order_delivery
BEFORE INSERT OR UPDATE OF status, paid_at
ON public.marketplace_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_marketplace_order_delivery();

-- Browser clients can create marketplace purchases only through the atomic
-- RPC. Seller/admin UPDATE workflows remain available under their existing
-- policies, with the delivery trigger above protecting paid transitions.
DROP POLICY IF EXISTS "Buyers can create orders" ON public.marketplace_orders;
REVOKE INSERT ON public.marketplace_orders FROM anon, authenticated;

-- Active is an editorial switch, while is_validated is the moderation gate.
-- Unvalidated imports remain available to their owner/admin through the
-- existing management policies but cannot appear in the public catalog.
DROP POLICY IF EXISTS "Anyone can view active marketplace courses"
  ON public.marketplace_courses;
CREATE POLICY "Anyone can view active marketplace courses"
ON public.marketplace_courses
FOR SELECT
USING (is_active = true AND is_validated = true);

-- A tenant listing may only reference a course owned by that same tenant.
-- Legacy/admin catalog rows with a NULL seller are supported only for the
-- canonical platform course tenant.
CREATE OR REPLACE FUNCTION public.guard_marketplace_course_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_source_organization_id uuid;
BEGIN
  SELECT c.organization_id
    INTO v_source_organization_id
  FROM public.courses c
  WHERE c.id = NEW.course_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace source course not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM v_source_organization_id
     AND NOT (
       NEW.organization_id IS NULL
       AND v_source_organization_id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
     )
  THEN
    RAISE EXCEPTION 'Marketplace listing tenant must own its source course'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_marketplace_course_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_marketplace_course_tenant() FROM anon;

DROP TRIGGER IF EXISTS guard_marketplace_course_tenant
  ON public.marketplace_courses;
CREATE TRIGGER guard_marketplace_course_tenant
BEFORE INSERT OR UPDATE OF course_id, organization_id
ON public.marketplace_courses
FOR EACH ROW
EXECUTE FUNCTION public.guard_marketplace_course_tenant();

-- Sellers may submit and withdraw a course, but only platform moderation may
-- promote it from unvalidated to validated. Content invalidation below is
-- deliberately allowed to downgrade true -> false for every caller.
CREATE OR REPLACE FUNCTION public.guard_marketplace_course_validation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Repointing an already validated listing is a content change. Keep the
  -- seller workflow available, but return the listing to moderation instead
  -- of transferring the old validation bit to a different course.
  IF TG_OP = 'UPDATE'
     AND NEW.course_id IS DISTINCT FROM OLD.course_id
     AND NEW.is_validated IS TRUE
     AND auth.role() <> 'service_role'
     AND NOT public.has_role('admin'::public.app_role, auth.uid())
     AND current_user NOT IN ('postgres', 'supabase_admin')
  THEN
    NEW.is_validated := false;
    RETURN NEW;
  END IF;

  IF NEW.is_validated IS NOT TRUE
     OR (
       TG_OP = 'UPDATE'
       AND NEW.is_validated IS NOT DISTINCT FROM OLD.is_validated
     )
  THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role'
     OR public.has_role('admin'::public.app_role, auth.uid())
     OR current_user IN ('postgres', 'supabase_admin')
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only platform moderation may validate marketplace courses'
    USING ERRCODE = '42501';
END
$function$;

REVOKE ALL ON FUNCTION public.guard_marketplace_course_validation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_marketplace_course_validation() FROM anon;

DROP TRIGGER IF EXISTS guard_marketplace_course_validation
  ON public.marketplace_courses;
CREATE TRIGGER guard_marketplace_course_validation
BEFORE INSERT OR UPDATE OF is_validated, course_id
ON public.marketplace_courses
FOR EACH ROW
EXECUTE FUNCTION public.guard_marketplace_course_validation();

-- Any source-content mutation invalidates prior moderation. The owner keeps
-- full editing functionality; the listing simply returns to Beta moderation
-- until an admin validates the updated version again.
CREATE OR REPLACE FUNCTION public.invalidate_marketplace_course_validation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_old_course_id uuid;
  v_new_course_id uuid;
  v_old_lesson_id uuid;
  v_new_lesson_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'courses' THEN
    v_old_course_id := OLD.id;
    v_new_course_id := NEW.id;
  ELSIF TG_TABLE_NAME IN ('course_modules', 'lessons', 'course_documents') THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_course_id := OLD.course_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_new_course_id := NEW.course_id;
    END IF;
  ELSIF TG_TABLE_NAME IN ('test_questions', 'lesson_attachments') THEN
    IF TG_OP <> 'INSERT' THEN
      v_old_lesson_id := OLD.lesson_id;
      SELECT l.course_id INTO v_old_course_id
      FROM public.lessons l
      WHERE l.id = v_old_lesson_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      v_new_lesson_id := NEW.lesson_id;
      SELECT l.course_id INTO v_new_course_id
      FROM public.lessons l
      WHERE l.id = v_new_lesson_id;
    END IF;
  END IF;

  UPDATE public.marketplace_courses mc
  SET is_validated = false
  WHERE mc.is_validated = true
    AND mc.course_id IN (v_old_course_id, v_new_course_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.invalidate_marketplace_course_validation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invalidate_marketplace_course_validation() FROM anon;

DROP TRIGGER IF EXISTS invalidate_marketplace_course_on_course_update
  ON public.courses;
CREATE TRIGGER invalidate_marketplace_course_on_course_update
AFTER UPDATE ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_marketplace_course_validation();

DROP TRIGGER IF EXISTS invalidate_marketplace_course_on_module_mutation
  ON public.course_modules;
CREATE TRIGGER invalidate_marketplace_course_on_module_mutation
AFTER INSERT OR UPDATE OR DELETE ON public.course_modules
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_marketplace_course_validation();

DROP TRIGGER IF EXISTS invalidate_marketplace_course_on_lesson_mutation
  ON public.lessons;
CREATE TRIGGER invalidate_marketplace_course_on_lesson_mutation
AFTER INSERT OR UPDATE OR DELETE ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_marketplace_course_validation();

DROP TRIGGER IF EXISTS invalidate_marketplace_course_on_question_mutation
  ON public.test_questions;
CREATE TRIGGER invalidate_marketplace_course_on_question_mutation
AFTER INSERT OR UPDATE OR DELETE ON public.test_questions
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_marketplace_course_validation();

DROP TRIGGER IF EXISTS invalidate_marketplace_course_on_attachment_mutation
  ON public.lesson_attachments;
CREATE TRIGGER invalidate_marketplace_course_on_attachment_mutation
AFTER INSERT OR UPDATE OR DELETE ON public.lesson_attachments
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_marketplace_course_validation();

DROP TRIGGER IF EXISTS invalidate_marketplace_course_on_document_mutation
  ON public.course_documents;
CREATE TRIGGER invalidate_marketplace_course_on_document_mutation
AFTER INSERT OR UPDATE OR DELETE ON public.course_documents
FOR EACH ROW
EXECUTE FUNCTION public.invalidate_marketplace_course_validation();

-- Seller status controls remain available, but the broad UPDATE policy must
-- not let a seller rewrite the buyer, listing, price or payment identity.
CREATE OR REPLACE FUNCTION public.guard_marketplace_order_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_trusted boolean :=
    auth.role() = 'service_role'
    OR public.has_role('admin'::public.app_role, auth.uid())
    OR current_user IN ('postgres', 'supabase_admin');
BEGIN
  -- There is no refund ledger in the current schema. Never allow a settled
  -- order to be converted to cancelled, including through a broad admin UI
  -- update; a future refund workflow must reverse the balance atomically.
  IF (OLD.status = 'paid' AND NEW.status NOT IN ('paid', 'completed'))
     OR (OLD.status = 'completed' AND NEW.status <> 'completed')
  THEN
    RAISE EXCEPTION 'A settled marketplace order requires an explicit refund workflow before reversal'
      USING ERRCODE = '23514';
  END IF;

  -- Sellers retain the useful review lifecycle, but cannot jump directly to
  -- a financial state. The atomic purchase RPC/platform admin may perform a
  -- trusted transition (notably pending -> paid after delivery succeeds).
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'pending' AND NEW.status IN ('approved', 'cancelled'))
       OR (OLD.status = 'approved' AND NEW.status = 'cancelled')
       OR (OLD.status = 'paid' AND NEW.status = 'completed')
     )
     AND NOT v_trusted
  THEN
    RAISE EXCEPTION 'Marketplace order status transition is not allowed'
      USING ERRCODE = '23514';
  END IF;

  IF ROW(
       NEW.marketplace_course_id,
       NEW.buyer_user_id,
       NEW.buyer_organization_id,
       NEW.buyer_type,
       NEW.price,
       NEW.students_count,
       NEW.notes,
       NEW.payment_method,
       NEW.paid_at,
       NEW.created_at
     ) IS NOT DISTINCT FROM ROW(
       OLD.marketplace_course_id,
       OLD.buyer_user_id,
       OLD.buyer_organization_id,
       OLD.buyer_type,
       OLD.price,
       OLD.students_count,
       OLD.notes,
       OLD.payment_method,
       OLD.paid_at,
       OLD.created_at
     )
  THEN
    RETURN NEW;
  END IF;

  IF v_trusted THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Marketplace order financial fields are immutable'
    USING ERRCODE = '42501';
END
$function$;

REVOKE ALL ON FUNCTION public.guard_marketplace_order_immutable_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_marketplace_order_immutable_fields() FROM anon;

DROP TRIGGER IF EXISTS guard_marketplace_order_immutable_fields
  ON public.marketplace_orders;
CREATE TRIGGER guard_marketplace_order_immutable_fields
BEFORE UPDATE ON public.marketplace_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_marketplace_order_immutable_fields();

-- A marketplace order is marked paid only in the same transaction that
-- creates the delivered course and all course content currently supported by
-- the store clone (modules, lessons, questions and attachments). Any failure,
-- including the course quota trigger above, rolls the entire order back.
CREATE OR REPLACE FUNCTION public.purchase_marketplace_course(
  p_marketplace_course_id uuid,
  p_target_organization_id uuid,
  p_buyer_type text DEFAULT 'organization',
  p_students_count integer DEFAULT 1,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_listing public.marketplace_courses%ROWTYPE;
  v_source public.courses%ROWTYPE;
  v_order_id uuid;
  v_new_course_id uuid;
  v_new_module_id uuid;
  v_new_lesson_id uuid;
  v_price numeric;
  v_balance numeric;
  v_module_map jsonb := '{}'::jsonb;
  v_module record;
  v_lesson record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_marketplace_course_id IS NULL OR p_target_organization_id IS NULL THEN
    RAISE EXCEPTION 'Marketplace course and target organization are required'
      USING ERRCODE = '22023';
  END IF;

  -- The current product delivers a cloned course to an organization. A future
  -- student-specific delivery flow must use its own atomic enrollment RPC.
  IF p_buyer_type IS DISTINCT FROM 'organization' THEN
    RAISE EXCEPTION 'Only organization marketplace purchases are supported'
      USING ERRCODE = '22023';
  END IF;

  IF p_students_count IS NULL OR p_students_count < 1 THEN
    RAISE EXCEPTION 'Students count must be positive' USING ERRCODE = '22023';
  END IF;

  -- This helper excludes ordinary students while preserving platform admins,
  -- organization owners and org_staff with courses.write.
  IF NOT public.can_manage_course_files_org(
    p_target_organization_id,
    'courses.write'
  ) THEN
    RAISE EXCEPTION 'Insufficient permission to purchase a course for this organization'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize balance changes for this buyer before the quota trigger locks
  -- the same organization row. This preserves the global organization-row
  -- first lock order and prevents two concurrent purchases overspending it.
  SELECT o.balance
    INTO v_balance
  FROM public.organizations o
  WHERE o.id = p_target_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target organization not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT mc.*
    INTO v_listing
  FROM public.marketplace_courses mc
  WHERE mc.id = p_marketplace_course_id
    AND mc.is_active = true
    AND mc.is_validated = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active marketplace course not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.*
    INTO v_source
  FROM public.courses c
  WHERE c.id = v_listing.course_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marketplace source course not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_listing.organization_id IS DISTINCT FROM v_source.organization_id
     AND NOT (
       v_listing.organization_id IS NULL
       AND v_source.organization_id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'::uuid
     )
  THEN
    RAISE EXCEPTION 'Marketplace listing tenant does not own its source course'
      USING ERRCODE = 'P0002';
  END IF;

  -- Never trust a client-supplied price.
  v_price := v_listing.price_organization;

  IF v_price < 0 THEN
    RAISE EXCEPTION 'Marketplace price cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_balance < v_price THEN
    RAISE EXCEPTION 'Insufficient organization balance'
      USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.marketplace_orders (
    marketplace_course_id,
    buyer_user_id,
    buyer_organization_id,
    buyer_type,
    status,
    price,
    students_count,
    notes,
    payment_method,
    paid_at
  )
  VALUES (
    v_listing.id,
    v_user_id,
    p_target_organization_id,
    'organization',
    'pending',
    v_price,
    p_students_count,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    'balance',
    NULL
  )
  RETURNING id INTO v_order_id;

  IF v_price > 0 THEN
    INSERT INTO public.balance_transactions (
      organization_id,
      amount,
      type,
      description,
      related_order_id,
      performed_by
    )
    VALUES (
      p_target_organization_id,
      -v_price,
      'marketplace_purchase',
      'Покупка курса «' || v_source.title || '»',
      v_order_id,
      v_user_id
    );

    UPDATE public.organizations
    SET balance = balance - v_price
    WHERE id = p_target_organization_id;
  END IF;

  INSERT INTO public.courses (
    accent_color,
    allow_materials_download,
    allow_video_seek,
    catalog_order,
    category_id,
    completion_notify_emails,
    cover_image_url,
    default_access_days,
    description,
    duration,
    frdo_document_type,
    frdo_duration_hours,
    frdo_education_form,
    frdo_financing_source,
    frdo_profession_name,
    frdo_professional_area,
    frdo_program_type,
    frdo_qualification_name,
    frdo_qualification_rank,
    frdo_specialty_group,
    generation_progress,
    hidden_from_catalog,
    is_published,
    landing_content,
    notify_on_completion,
    organization_id,
    price,
    reminder_advance_days,
    require_enrollment_approval,
    retraining_period_months,
    sequential_lessons,
    skip_video_identification,
    slug,
    source_course_id,
    source_order_id,
    title,
    training_form
  )
  VALUES (
    v_source.accent_color,
    v_source.allow_materials_download,
    v_source.allow_video_seek,
    v_source.catalog_order,
    NULL,
    -- Extra notification recipients belong to the seller tenant. The buyer
    -- may configure its own recipients without receiving seller addresses.
    NULL,
    v_source.cover_image_url,
    v_source.default_access_days,
    v_source.description,
    v_source.duration,
    v_source.frdo_document_type,
    v_source.frdo_duration_hours,
    v_source.frdo_education_form,
    v_source.frdo_financing_source,
    v_source.frdo_profession_name,
    v_source.frdo_professional_area,
    v_source.frdo_program_type,
    v_source.frdo_qualification_name,
    v_source.frdo_qualification_rank,
    v_source.frdo_specialty_group,
    v_source.generation_progress,
    v_source.hidden_from_catalog,
    v_source.is_published,
    v_source.landing_content,
    v_source.notify_on_completion,
    p_target_organization_id,
    v_source.price,
    v_source.reminder_advance_days,
    v_source.require_enrollment_approval,
    v_source.retraining_period_months,
    v_source.sequential_lessons,
    v_source.skip_video_identification,
    NULL,
    v_source.id,
    v_order_id,
    v_source.title,
    v_source.training_form
  )
  RETURNING id INTO v_new_course_id;

  INSERT INTO public.course_documents (
    course_id,
    name,
    type,
    description,
    file_url
  )
  SELECT
    v_new_course_id,
    d.name,
    d.type,
    d.description,
    d.file_url
  FROM public.course_documents d
  WHERE d.course_id = v_source.id;

  FOR v_module IN
    SELECT m.id, m.title, m.order_index
    FROM public.course_modules m
    WHERE m.course_id = v_source.id
    ORDER BY m.order_index, m.id
  LOOP
    INSERT INTO public.course_modules (course_id, title, order_index)
    VALUES (v_new_course_id, v_module.title, v_module.order_index)
    RETURNING id INTO v_new_module_id;

    v_module_map := v_module_map || jsonb_build_object(
      v_module.id::text,
      v_new_module_id::text
    );
  END LOOP;

  -- module_access_schedules/module_access_overrides are intentionally reset.
  -- Their absolute dates and per-user exceptions belong to the seller tenant;
  -- the buyer configures a new schedule for the cloned modules when needed.
  FOR v_lesson IN
    SELECT l.*
    FROM public.lessons l
    WHERE l.course_id = v_source.id
    ORDER BY l.order_index, l.id
  LOOP
    IF v_lesson.module_id IS NOT NULL
       AND NOT (v_module_map ? v_lesson.module_id::text)
    THEN
      RAISE EXCEPTION 'Marketplace source lesson % references a module outside the source course',
        v_lesson.id
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.lessons (
      ai_avatar_allow_interruptions,
      ai_avatar_greeting,
      ai_avatar_image_url,
      ai_avatar_language,
      ai_avatar_llm_model,
      ai_avatar_llm_provider,
      ai_avatar_model,
      ai_avatar_name,
      ai_avatar_session_minutes,
      ai_avatar_stt_model,
      ai_avatar_stt_provider,
      ai_avatar_style,
      ai_avatar_subject,
      ai_avatar_system_prompt,
      ai_avatar_tts_provider,
      ai_avatar_tts_voice,
      ai_avatar_voice_id,
      content,
      course_id,
      is_locked,
      module_id,
      order_index,
      test_max_attempts,
      test_passing_score,
      test_questions_count,
      test_questions_to_show,
      test_show_answers,
      title,
      type
    )
    VALUES (
      v_lesson.ai_avatar_allow_interruptions,
      v_lesson.ai_avatar_greeting,
      v_lesson.ai_avatar_image_url,
      v_lesson.ai_avatar_language,
      v_lesson.ai_avatar_llm_model,
      v_lesson.ai_avatar_llm_provider,
      v_lesson.ai_avatar_model,
      v_lesson.ai_avatar_name,
      v_lesson.ai_avatar_session_minutes,
      v_lesson.ai_avatar_stt_model,
      v_lesson.ai_avatar_stt_provider,
      v_lesson.ai_avatar_style,
      v_lesson.ai_avatar_subject,
      v_lesson.ai_avatar_system_prompt,
      v_lesson.ai_avatar_tts_provider,
      v_lesson.ai_avatar_tts_voice,
      v_lesson.ai_avatar_voice_id,
      v_lesson.content,
      v_new_course_id,
      v_lesson.is_locked,
      CASE
        WHEN v_lesson.module_id IS NULL THEN NULL
        ELSE (v_module_map ->> v_lesson.module_id::text)::uuid
      END,
      v_lesson.order_index,
      v_lesson.test_max_attempts,
      v_lesson.test_passing_score,
      v_lesson.test_questions_count,
      v_lesson.test_questions_to_show,
      v_lesson.test_show_answers,
      v_lesson.title,
      v_lesson.type
    )
    RETURNING id INTO v_new_lesson_id;

    INSERT INTO public.test_questions (
      lesson_id,
      question,
      options,
      correct_answer,
      explanation,
      image_url,
      is_bank_question,
      order_index
    )
    SELECT
      v_new_lesson_id,
      q.question,
      q.options,
      q.correct_answer,
      q.explanation,
      q.image_url,
      q.is_bank_question,
      q.order_index
    FROM public.test_questions q
    WHERE q.lesson_id = v_lesson.id;

    INSERT INTO public.lesson_attachments (
      lesson_id,
      name,
      file_url,
      file_type,
      file_size,
      category,
      order_index
    )
    SELECT
      v_new_lesson_id,
      a.name,
      a.file_url,
      a.file_type,
      a.file_size,
      a.category,
      a.order_index
    FROM public.lesson_attachments a
    WHERE a.lesson_id = v_lesson.id;
  END LOOP;

  UPDATE public.marketplace_orders
  SET status = 'paid', paid_at = now()
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'course_id', v_new_course_id,
    'price', v_price
  );
END
$function$;

REVOKE ALL ON FUNCTION public.purchase_marketplace_course(uuid, uuid, text, integer, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_marketplace_course(uuid, uuid, text, integer, text)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.purchase_marketplace_course(uuid, uuid, text, integer, text)
  TO authenticated;
