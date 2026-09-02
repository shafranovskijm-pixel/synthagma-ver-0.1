-- Electronic library schema foundation for the unpublished 178-hour CSZ course.
--
-- This migration intentionally creates no new storage bucket and performs no
-- data import. public.library_documents remains the canonical resource card;
-- public.course_documents remains the course-assignment bridge. All new
-- columns are nullable (or have harmless defaults) so legacy course materials
-- continue to work until the frontend is migrated.

-- Fail closed before any DDL when the expected production foundation is not
-- present. In particular, this migration must reuse library-files, not create
-- a second bucket or silently select another storage model.
DO $preflight$
BEGIN
  IF to_regclass('public.library_documents') IS NULL
     OR to_regclass('public.library_folders') IS NULL
     OR to_regclass('public.course_documents') IS NULL
     OR to_regclass('public.course_modules') IS NULL
     OR to_regclass('public.courses') IS NULL
     OR to_regclass('public.enrollments') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('public.student_groups') IS NULL
     OR to_regclass('storage.buckets') IS NULL
     OR to_regclass('storage.objects') IS NULL
  THEN
    RAISE EXCEPTION 'Electronic-library migration prerequisites are missing';
  END IF;

  IF to_regprocedure('public.can_access_organization(uuid,text)') IS NULL
     OR to_regprocedure('public.can_access_course(uuid,text)') IS NULL
     OR to_regprocedure('public.storage_try_uuid(text)') IS NULL
  THEN
    RAISE EXCEPTION 'Required tenant access helpers are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'library-files'
  ) THEN
    RAISE EXCEPTION
      'Required existing private bucket library-files is missing; migration will not create a duplicate bucket';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Canonical electronic-library resource metadata.
-- ---------------------------------------------------------------------------

ALTER TABLE public.library_documents
  ADD COLUMN IF NOT EXISTS source_name text,
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS original_filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS edition_label text,
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS usage_basis text,
  ADD COLUMN IF NOT EXISTS library_status text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

-- Preserve existing organization-library files before the bucket becomes
-- private. Only URLs produced by Supabase for this exact bucket are converted;
-- arbitrary external file_url values remain untouched.
UPDATE public.library_documents
SET storage_path = substring(
  file_url FROM '/storage/v1/object/(?:public|sign)/library-files/([^?]+)'
)
WHERE storage_path IS NULL
  AND file_url ~ '/storage/v1/object/(?:public|sign)/library-files/';

DO $legacy_file_backfill$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.library_documents
    WHERE file_url LIKE '%/library-files/%'
      AND storage_path IS NULL
  ) THEN
    RAISE EXCEPTION
      'Some legacy library-files URLs could not be converted to private storage_path values';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.library_documents legacy_document
    WHERE legacy_document.storage_path IS NOT NULL
      AND legacy_document.storage_path !~ (
        '^library/' || legacy_document.organization_id::text || '/[^/]+$'
      )
  ) THEN
    RAISE EXCEPTION
      'A legacy library-files object path does not belong to its document organization';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.library_documents legacy_document
    WHERE legacy_document.storage_path IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM storage.objects stored_object
        WHERE stored_object.bucket_id = 'library-files'
          AND stored_object.name = legacy_document.storage_path
      )
  ) THEN
    RAISE EXCEPTION
      'A legacy library-files object path has no matching storage object';
  END IF;
END;
$legacy_file_backfill$;

COMMENT ON COLUMN public.library_documents.source_name IS
  'Author, manufacturer or source organization shown to learners and reviewers.';
COMMENT ON COLUMN public.library_documents.external_url IS
  'HTTPS source URL. Mutually exclusive with storage_path for an active electronic-library resource.';
COMMENT ON COLUMN public.library_documents.storage_path IS
  'Private library-files object path: library/{organization_id}/{filename}. Use a signed URL; never persist a public URL.';
COMMENT ON COLUMN public.library_documents.edition_label IS
  'Required date or free-form edition/revision label for an active resource.';
COMMENT ON COLUMN public.library_documents.last_checked_at IS
  'Last successful availability/content check performed by the organization.';
COMMENT ON COLUMN public.library_documents.usage_basis IS
  'Legal basis: official_open_source, own_material or rights_holder_permission.';
COMMENT ON COLUMN public.library_documents.library_status IS
  'Lifecycle status: active, needs_review or archive. Client DELETE is intentionally disabled.';

ALTER TABLE public.library_documents
  ADD CONSTRAINT library_documents_usage_basis_check
  CHECK (
    usage_basis IS NULL OR usage_basis IN (
      'official_open_source',
      'own_material',
      'rights_holder_permission'
    )
  ) NOT VALID,
  ADD CONSTRAINT library_documents_library_status_check
  CHECK (
    library_status IS NULL OR library_status IN (
      'active',
      'needs_review',
      'archive'
    )
  ) NOT VALID,
  ADD CONSTRAINT library_documents_https_url_check
  CHECK (
    external_url IS NULL OR (
      external_url ~* '^https://[^[:space:]]+$'
      AND external_url !~* '^https://[^/[:space:]]*@'
    )
  ) NOT VALID,
  ADD CONSTRAINT library_documents_single_source_check
  CHECK (num_nonnulls(external_url, storage_path) <= 1) NOT VALID,
  ADD CONSTRAINT library_documents_storage_path_scope_check
  CHECK (
    storage_path IS NULL OR storage_path ~ (
      '^library/' || organization_id::text
      || '/[^/]+$'
    )
  ) NOT VALID,
  ADD CONSTRAINT library_documents_active_resource_complete_check
  CHECK (
    library_status IS DISTINCT FROM 'active' OR (
      NULLIF(btrim(source_name), '') IS NOT NULL
      AND usage_basis IS NOT NULL
      AND last_checked_at IS NOT NULL
      AND num_nonnulls(external_url, storage_path) = 1
      AND NULLIF(btrim(edition_label), '') IS NOT NULL
    )
  ) NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. Reuse course_documents as the bridge from a course/module to one
--    canonical library resource. Existing direct file_url rows stay valid.
-- ---------------------------------------------------------------------------

ALTER TABLE public.course_documents
  ADD COLUMN IF NOT EXISTS library_document_id uuid,
  ADD COLUMN IF NOT EXISTS module_id uuid,
  ADD COLUMN IF NOT EXISTS library_category text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visible_to_students boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_download boolean NOT NULL DEFAULT true;

ALTER TABLE public.course_documents
  ADD CONSTRAINT course_documents_library_document_id_fkey
  FOREIGN KEY (library_document_id)
  REFERENCES public.library_documents(id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT course_documents_module_id_fkey
  FOREIGN KEY (module_id)
  REFERENCES public.course_modules(id)
  ON DELETE SET NULL,
  ADD CONSTRAINT course_documents_library_category_check
  CHECK (
    library_category IS NULL OR library_category IN (
      'legal_acts',
      'educational_materials',
      'manufacturer_guides',
      'additional_resources'
    )
  ) NOT VALID,
  ADD CONSTRAINT course_documents_sort_order_check
  CHECK (sort_order >= 0) NOT VALID,
  ADD CONSTRAINT course_documents_link_category_check
  CHECK (library_document_id IS NULL OR library_category IS NOT NULL) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_course_documents_course_id
  ON public.course_documents(course_id);
CREATE INDEX IF NOT EXISTS idx_course_documents_library_document_id
  ON public.course_documents(library_document_id)
  WHERE library_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_documents_module_id
  ON public.course_documents(module_id)
  WHERE module_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_course_documents_library_listing
  ON public.course_documents(course_id, visible_to_students, sort_order)
  WHERE library_document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_library_documents_storage_path
  ON public.library_documents(storage_path)
  WHERE storage_path IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_documents_course_library_document
  ON public.course_documents(course_id, library_document_id)
  WHERE library_document_id IS NOT NULL;

COMMENT ON COLUMN public.course_documents.library_document_id IS
  'Canonical electronic-library resource. NULL preserves legacy direct course documents.';
COMMENT ON COLUMN public.course_documents.module_id IS
  'Optional module within the same course. Enforced by validate_course_library_assignment_scope().';
COMMENT ON COLUMN public.course_documents.library_category IS
  'Course-library category: legal_acts, educational_materials, manufacturer_guides or additional_resources.';
COMMENT ON COLUMN public.course_documents.sort_order IS
  'Display order inside the course electronic library.';
COMMENT ON COLUMN public.course_documents.visible_to_students IS
  'Course-specific visibility switch. Linked rows are hidden with UPDATE, not deleted by clients.';
COMMENT ON COLUMN public.course_documents.allow_download IS
  'Whether the learner UI may offer download for an internal file.';

-- ---------------------------------------------------------------------------
-- 3. Tenant and module invariants. RLS is not a substitute for these guards:
--    service-role code and foreign keys must not be able to cross-link tenants.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_library_document_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_folder_organization_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'library document organization_id is immutable';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  ELSE
    NEW.created_by := OLD.created_by;
  END IF;

  NEW.source_name := NULLIF(btrim(NEW.source_name), '');
  NEW.external_url := NULLIF(btrim(NEW.external_url), '');
  NEW.storage_path := NULLIF(btrim(NEW.storage_path), '');
  NEW.original_filename := NULLIF(btrim(NEW.original_filename), '');
  NEW.mime_type := NULLIF(btrim(NEW.mime_type), '');
  NEW.edition_label := NULLIF(btrim(NEW.edition_label), '');

  IF NEW.last_checked_at > now() THEN
    RAISE EXCEPTION 'last_checked_at cannot be in the future';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (
       NEW.external_url IS DISTINCT FROM OLD.external_url
       OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.source_name IS DISTINCT FROM OLD.source_name
       OR NEW.edition_label IS DISTINCT FROM OLD.edition_label
       OR NEW.usage_basis IS DISTINCT FROM OLD.usage_basis
     )
     AND NEW.last_checked_at IS NOT DISTINCT FROM OLD.last_checked_at
  THEN
    NEW.last_checked_at := NULL;
    IF NEW.library_status = 'active' THEN
      NEW.library_status := 'needs_review';
    END IF;
  END IF;

  IF num_nonnulls(NEW.external_url, NEW.storage_path) > 0
     AND NEW.library_status IS NULL
  THEN
    NEW.library_status := 'needs_review';
  END IF;

  -- Incomplete cards remain saveable for administrators but cannot be exposed
  -- as active resources to teachers or learners.
  IF NEW.library_status = 'active'
     AND (
       NEW.source_name IS NULL
       OR NEW.usage_basis IS NULL
       OR NEW.last_checked_at IS NULL
       OR num_nonnulls(NEW.external_url, NEW.storage_path) <> 1
       OR NEW.edition_label IS NULL
     )
  THEN
    NEW.library_status := 'needs_review';
  END IF;

  IF NEW.folder_id IS NOT NULL THEN
    SELECT lf.organization_id
    INTO v_folder_organization_id
    FROM public.library_folders lf
    WHERE lf.id = NEW.folder_id;

    IF v_folder_organization_id IS NULL THEN
      RAISE EXCEPTION 'library folder % does not exist', NEW.folder_id;
    END IF;
    IF v_folder_organization_id <> NEW.organization_id THEN
      RAISE EXCEPTION 'library document and folder belong to different organizations';
    END IF;
  END IF;

  IF NEW.library_status = 'archive' THEN
    IF TG_OP = 'INSERT' OR OLD.library_status IS DISTINCT FROM 'archive' THEN
      NEW.archived_at := now();
      NEW.archived_by := auth.uid();
    ELSE
      NEW.archived_at := OLD.archived_at;
      NEW.archived_by := OLD.archived_by;
    END IF;
  ELSE
    NEW.archived_at := NULL;
    NEW.archived_by := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_library_document_scope_trigger
  ON public.library_documents;
CREATE TRIGGER validate_library_document_scope_trigger
BEFORE INSERT OR UPDATE ON public.library_documents
FOR EACH ROW
EXECUTE FUNCTION public.validate_library_document_scope();

CREATE OR REPLACE FUNCTION public.validate_library_folder_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_parent_organization_id uuid;
  v_cycle boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'library folder organization_id is immutable';
  END IF;

  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'library folder cannot be its own parent';
  END IF;

  SELECT lf.organization_id
  INTO v_parent_organization_id
  FROM public.library_folders lf
  WHERE lf.id = NEW.parent_id;

  IF v_parent_organization_id IS NULL THEN
    RAISE EXCEPTION 'parent library folder % does not exist', NEW.parent_id;
  END IF;
  IF v_parent_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'library folder and parent belong to different organizations';
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT lf.id, lf.parent_id
    FROM public.library_folders lf
    WHERE lf.id = NEW.parent_id
    -- UNION (not UNION ALL) also terminates safely if legacy data already
    -- contains an unrelated cycle.
    UNION
    SELECT lf.id, lf.parent_id
    FROM public.library_folders lf
    JOIN ancestors a ON a.parent_id = lf.id
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
  INTO v_cycle;

  IF v_cycle THEN
    RAISE EXCEPTION 'library folder hierarchy cannot contain a cycle';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_library_folder_scope_trigger
  ON public.library_folders;
CREATE TRIGGER validate_library_folder_scope_trigger
BEFORE INSERT OR UPDATE ON public.library_folders
FOR EACH ROW
EXECUTE FUNCTION public.validate_library_folder_scope();

CREATE OR REPLACE FUNCTION public.validate_course_library_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_course_organization_id uuid;
  v_course_electronic_library_enabled boolean;
  v_document_organization_id uuid;
  v_module_course_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.library_document_id IS NOT NULL
     AND (
       NEW.library_document_id IS DISTINCT FROM OLD.library_document_id
       OR NEW.course_id IS DISTINCT FROM OLD.course_id
    )
  THEN
    RAISE EXCEPTION
      'linked library_document_id and course_id are immutable; hide the assignment instead';
  END IF;

  SELECT
    c.organization_id,
    COALESCE(
      c.landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb,
      false
    )
  INTO v_course_organization_id, v_course_electronic_library_enabled
  FROM public.courses c
  WHERE c.id = NEW.course_id;

  IF v_course_organization_id IS NULL THEN
    RAISE EXCEPTION 'course % does not exist', NEW.course_id;
  END IF;

  IF NEW.library_document_id IS NOT NULL THEN
    IF NOT v_course_electronic_library_enabled THEN
      RAISE EXCEPTION 'electronic library is not explicitly enabled for course %', NEW.course_id;
    END IF;

    SELECT ld.organization_id
    INTO v_document_organization_id
    FROM public.library_documents ld
    WHERE ld.id = NEW.library_document_id;

    IF v_document_organization_id IS NULL THEN
      RAISE EXCEPTION 'library document % does not exist', NEW.library_document_id;
    END IF;
    IF v_document_organization_id <> v_course_organization_id THEN
      RAISE EXCEPTION 'course and library document belong to different organizations';
    END IF;

  END IF;

  IF NEW.module_id IS NOT NULL THEN
    SELECT cm.course_id
    INTO v_module_course_id
    FROM public.course_modules cm
    WHERE cm.id = NEW.module_id;

    IF v_module_course_id IS NULL THEN
      RAISE EXCEPTION 'course module % does not exist', NEW.module_id;
    END IF;
    IF v_module_course_id <> NEW.course_id THEN
      RAISE EXCEPTION 'course document module belongs to another course';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS validate_course_library_assignment_scope_trigger
  ON public.course_documents;
CREATE TRIGGER validate_course_library_assignment_scope_trigger
BEFORE INSERT OR UPDATE ON public.course_documents
FOR EACH ROW
EXECUTE FUNCTION public.validate_course_library_assignment_scope();

-- ---------------------------------------------------------------------------
-- 4. Read helpers used by both table RLS and private Storage RLS.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.can_access_course_as_learner(_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.courses c ON c.id = e.course_id
    WHERE e.user_id = auth.uid()
      AND e.course_id = _course_id
      AND c.is_published = true
      AND e.status IN ('active', 'completed')
      -- Keep the existing SINTAGMA enrollment contract: completion preserves
      -- course access even when the original access period has elapsed.
      AND (
        e.expires_at IS NULL
        OR e.expires_at > now()
        OR e.status = 'completed'
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_read_electronic_library_document(
  _library_document_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.library_documents ld
    WHERE ld.id = _library_document_id
      AND (
        -- Only library writers may review draft and archived cards. A teacher
        -- with read-only access must see exactly the active linked set that a
        -- learner sees for a course.
        public.can_access_organization(ld.organization_id, 'library.write')
        OR (
          -- Teachers and learners receive only active resources that are
          -- actually assigned to a course they may read.
          ld.library_status = 'active'
          AND EXISTS (
            SELECT 1
            FROM public.course_documents cd
            JOIN public.courses c ON c.id = cd.course_id
            WHERE cd.library_document_id = ld.id
              AND cd.visible_to_students
              AND COALESCE(
                c.landing_content @> '{"electronic_library":{"enabled":true}}'::jsonb,
                false
              )
              AND (
                public.can_access_course(cd.course_id, 'courses.read')
                OR public.can_access_course_as_learner(cd.course_id)
              )
          )
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_read_library_file_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH path_parts AS (
    SELECT
      (storage.foldername(_object_name))[1] AS root_name,
      public.storage_try_uuid((storage.foldername(_object_name))[2]) AS organization_id
  )
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM path_parts p
    WHERE p.root_name = 'library'
      AND p.organization_id IS NOT NULL
      AND (
        -- Learners receive only an object referenced by a readable canonical
        -- card. The generated UUID is part of the filename, not a path level.
        EXISTS (
          SELECT 1
          FROM public.library_documents ld
          WHERE ld.organization_id = p.organization_id
            AND ld.storage_path = _object_name
            AND public.can_read_electronic_library_document(ld.id)
        )
        -- Existing unlinked library/{org}/{filename} objects remain available
        -- to authorized staff, but never to learners without a canonical card.
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.library_documents linked_document
            WHERE linked_document.organization_id = p.organization_id
              AND linked_document.storage_path = _object_name
          )
          AND (
            public.can_access_organization(p.organization_id, 'library.write')
          )
        )
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_manage_library_file_object(_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH path_parts AS (
    SELECT
      (storage.foldername(_object_name))[1] AS root_name,
      public.storage_try_uuid((storage.foldername(_object_name))[2]) AS organization_id
  )
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM path_parts p
    WHERE p.root_name = 'library'
      AND p.organization_id IS NOT NULL
      AND public.can_access_organization(p.organization_id, 'library.write')
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_delete_orphan_library_file_object(
  _object_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    public.can_manage_library_file_object(_object_name)
    AND NOT EXISTS (
      SELECT 1
      FROM public.library_documents ld
      WHERE ld.storage_path = _object_name
    )
$function$;

REVOKE ALL ON FUNCTION public.validate_library_document_scope() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_library_folder_scope() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_course_library_assignment_scope() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_course_as_learner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_electronic_library_document(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_library_file_object(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_library_file_object(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_delete_orphan_library_file_object(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_access_course_as_learner(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_electronic_library_document(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_library_file_object(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_library_file_object(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_delete_orphan_library_file_object(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.can_read_electronic_library_document(uuid) IS
  'Allows library staff or a teacher/learner with course access to read an active linked resource.';
COMMENT ON FUNCTION public.can_read_library_file_object(text) IS
  'Storage SELECT guard for private library-files objects. The frontend must request a short-lived signed URL.';

-- ---------------------------------------------------------------------------
-- 5. Permission-aware table RLS. Broad profile-membership policies are
--    removed because they allowed any same-tenant profile to mutate content.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can view library documents of their organization"
  ON public.library_documents;
DROP POLICY IF EXISTS "Organization users can manage their library documents"
  ON public.library_documents;
DROP POLICY IF EXISTS "Admins can manage all library documents"
  ON public.library_documents;
DROP POLICY IF EXISTS library_documents_select ON public.library_documents;
DROP POLICY IF EXISTS library_documents_insert ON public.library_documents;
DROP POLICY IF EXISTS library_documents_update ON public.library_documents;
DROP POLICY IF EXISTS library_documents_delete ON public.library_documents;

DO $library_documents_policy_drift$
DECLARE
  unexpected_policies text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO unexpected_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'library_documents';

  IF unexpected_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'Unexpected library_documents policies must be reviewed before migration: %',
      unexpected_policies;
  END IF;
END;
$library_documents_policy_drift$;

CREATE POLICY library_documents_select
ON public.library_documents
FOR SELECT TO authenticated
USING (public.can_read_electronic_library_document(id));

CREATE POLICY library_documents_insert
ON public.library_documents
FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_organization(organization_id, 'library.write')
);

CREATE POLICY library_documents_update
ON public.library_documents
FOR UPDATE TO authenticated
USING (public.can_access_organization(organization_id, 'library.write'))
WITH CHECK (public.can_access_organization(organization_id, 'library.write'));

-- Deliberately no authenticated DELETE policy. Set library_status='archive'
-- instead. service_role remains available for controlled maintenance.

DROP POLICY IF EXISTS "Users can view library folders of their organization"
  ON public.library_folders;
DROP POLICY IF EXISTS "Organization users can create library folders"
  ON public.library_folders;
DROP POLICY IF EXISTS "Organization users can update their library folders"
  ON public.library_folders;
DROP POLICY IF EXISTS "Organization users can delete their library folders"
  ON public.library_folders;
DROP POLICY IF EXISTS library_folders_select ON public.library_folders;
DROP POLICY IF EXISTS library_folders_insert ON public.library_folders;
DROP POLICY IF EXISTS library_folders_update ON public.library_folders;
DROP POLICY IF EXISTS library_folders_delete ON public.library_folders;

DO $library_folders_policy_drift$
DECLARE
  unexpected_policies text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO unexpected_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'library_folders';

  IF unexpected_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'Unexpected library_folders policies must be reviewed before migration: %',
      unexpected_policies;
  END IF;
END;
$library_folders_policy_drift$;

CREATE POLICY library_folders_select
ON public.library_folders
FOR SELECT TO authenticated
USING (public.can_access_organization(organization_id, 'library.read'));

CREATE POLICY library_folders_insert
ON public.library_folders
FOR INSERT TO authenticated
WITH CHECK (public.can_access_organization(organization_id, 'library.write'));

CREATE POLICY library_folders_update
ON public.library_folders
FOR UPDATE TO authenticated
USING (public.can_access_organization(organization_id, 'library.write'))
WITH CHECK (public.can_access_organization(organization_id, 'library.write'));

CREATE POLICY library_folders_delete
ON public.library_folders
FOR DELETE TO authenticated
USING (public.can_access_organization(organization_id, 'library.write'));

DROP POLICY IF EXISTS "Org users can manage course documents"
  ON public.course_documents;
DROP POLICY IF EXISTS "Enrolled students can view course documents"
  ON public.course_documents;
DROP POLICY IF EXISTS course_documents_select ON public.course_documents;
DROP POLICY IF EXISTS course_documents_insert ON public.course_documents;
DROP POLICY IF EXISTS course_documents_update ON public.course_documents;
DROP POLICY IF EXISTS course_documents_delete_legacy ON public.course_documents;

DO $course_documents_policy_drift$
DECLARE
  unexpected_policies text;
BEGIN
  SELECT string_agg(policyname, ', ' ORDER BY policyname)
  INTO unexpected_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'course_documents';

  IF unexpected_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'Unexpected course_documents policies must be reviewed before migration: %',
      unexpected_policies;
  END IF;
END;
$course_documents_policy_drift$;

CREATE POLICY course_documents_select
ON public.course_documents
FOR SELECT TO authenticated
USING (
  (
    public.can_access_course(course_id, 'courses.read')
    AND (
      library_document_id IS NULL
      OR (
        visible_to_students
        AND public.can_read_electronic_library_document(library_document_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.library_documents managed_document
        WHERE managed_document.id = course_documents.library_document_id
          AND public.can_access_organization(
            managed_document.organization_id,
            'library.write'
          )
      )
    )
  )
  OR (
    public.can_access_course_as_learner(course_id)
    AND (
      library_document_id IS NULL
      OR (
        visible_to_students
        AND public.can_read_electronic_library_document(library_document_id)
      )
    )
  )
);

CREATE POLICY course_documents_insert
ON public.course_documents
FOR INSERT TO authenticated
WITH CHECK (
  public.can_access_course(course_id, 'courses.write')
  AND (
    library_document_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.library_documents managed_document
      WHERE managed_document.id = course_documents.library_document_id
        AND public.can_access_organization(
          managed_document.organization_id,
          'library.write'
        )
    )
  )
);

CREATE POLICY course_documents_update
ON public.course_documents
FOR UPDATE TO authenticated
USING (
  public.can_access_course(course_id, 'courses.write')
  AND (
    library_document_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.library_documents managed_document
      WHERE managed_document.id = course_documents.library_document_id
        AND public.can_access_organization(
          managed_document.organization_id,
          'library.write'
        )
    )
  )
)
WITH CHECK (
  public.can_access_course(course_id, 'courses.write')
  AND (
    library_document_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.library_documents managed_document
      WHERE managed_document.id = course_documents.library_document_id
        AND public.can_access_organization(
          managed_document.organization_id,
          'library.write'
        )
    )
  )
);

-- Legacy direct rows keep their existing delete workflow. Library-backed rows
-- must set visible_to_students=false; the canonical resource is retained.
CREATE POLICY course_documents_delete_legacy
ON public.course_documents
FOR DELETE TO authenticated
USING (
  library_document_id IS NULL
  AND public.can_access_course(course_id, 'courses.write')
);

-- ---------------------------------------------------------------------------
-- 6. Keep the existing library-files bucket private. Supabase signed URLs are
--    authorized through the SELECT policy below; no public URL is persisted.
-- ---------------------------------------------------------------------------

UPDATE storage.buckets
SET public = false
WHERE id = 'library-files';

DROP POLICY IF EXISTS "Library files are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Org users can read library files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload library files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update library files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete library files" ON storage.objects;
DROP POLICY IF EXISTS library_files_insert ON storage.objects;
DROP POLICY IF EXISTS library_files_update ON storage.objects;
DROP POLICY IF EXISTS library_files_delete ON storage.objects;
DROP POLICY IF EXISTS library_files_private_select ON storage.objects;
DROP POLICY IF EXISTS library_files_private_insert ON storage.objects;
DROP POLICY IF EXISTS library_files_private_update ON storage.objects;
DROP POLICY IF EXISTS library_files_private_delete ON storage.objects;
DROP POLICY IF EXISTS library_files_restrictive_select ON storage.objects;
DROP POLICY IF EXISTS library_files_restrictive_insert ON storage.objects;
DROP POLICY IF EXISTS library_files_restrictive_update ON storage.objects;
DROP POLICY IF EXISTS library_files_restrictive_delete ON storage.objects;

CREATE POLICY library_files_private_select
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'library-files'
  AND public.can_read_library_file_object(name)
);

CREATE POLICY library_files_private_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'library-files'
  AND public.can_manage_library_file_object(name)
);

CREATE POLICY library_files_private_update
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'library-files'
  AND public.can_delete_orphan_library_file_object(name)
)
WITH CHECK (
  bucket_id = 'library-files'
  AND public.can_delete_orphan_library_file_object(name)
);

CREATE POLICY library_files_private_delete
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'library-files'
  AND public.can_delete_orphan_library_file_object(name)
);

-- Referenced files cannot be deleted by an authenticated client. The narrow
-- policy above exists only to compensate a failed create transaction after a
-- unique object has been uploaded but before its canonical card is persisted.

-- Restrictive policies make the private-library contract resilient to an
-- unknown permissive production policy. They are neutral for every other
-- storage bucket.
CREATE POLICY library_files_restrictive_select
ON storage.objects
AS RESTRICTIVE
FOR SELECT TO PUBLIC
USING (
  bucket_id <> 'library-files'
  OR public.can_read_library_file_object(name)
);

CREATE POLICY library_files_restrictive_insert
ON storage.objects
AS RESTRICTIVE
FOR INSERT TO PUBLIC
WITH CHECK (
  bucket_id <> 'library-files'
  OR public.can_manage_library_file_object(name)
);

CREATE POLICY library_files_restrictive_update
ON storage.objects
AS RESTRICTIVE
FOR UPDATE TO PUBLIC
USING (
  bucket_id <> 'library-files'
  OR public.can_delete_orphan_library_file_object(name)
)
WITH CHECK (
  bucket_id <> 'library-files'
  OR public.can_delete_orphan_library_file_object(name)
);

CREATE POLICY library_files_restrictive_delete
ON storage.objects
AS RESTRICTIVE
FOR DELETE TO PUBLIC
USING (
  bucket_id <> 'library-files'
  OR public.can_delete_orphan_library_file_object(name)
);

ALTER TABLE public.library_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
