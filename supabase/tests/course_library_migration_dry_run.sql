-- Electronic-library migration dry-run for an isolated staging clone only.
--
-- Invoke this file only through
-- scripts/run-course-library-migration-dry-run.ps1. The wrapper rejects the
-- production project ref, requires an explicitly allowlisted staging ref and
-- host, and verifies a clone-only sentinel provisioned out-of-band by the
-- staging database administrator before this transaction is opened.
--
-- Never run this script against the sole production project. It applies the
-- migration inside one transaction, checks invariants and always rolls back.

\set ON_ERROR_STOP on

\if :{?protected_course_id}
\else
  \echo 'ERROR: protected_course_id is required; refusing to run'
  \quit 3
\endif

\if :{?staging_guard_token}
\else
  \echo 'ERROR: staging_guard_token is required; refusing to run'
  \quit 3
\endif

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '10s';
SELECT set_config('sintagma.protected_course_id', :'protected_course_id', true);
SELECT set_config('sintagma.staging_guard_token', :'staging_guard_token', true);

DO $preflight$
DECLARE
  staging_guard_matches boolean := false;
BEGIN
  IF to_regclass('public.sintagma_staging_guard') IS NULL THEN
    RAISE EXCEPTION
      'public.sintagma_staging_guard is missing; refusing remote execution';
  END IF;

  EXECUTE
    'SELECT EXISTS (SELECT 1 FROM public.sintagma_staging_guard WHERE token = $1)'
  INTO staging_guard_matches
  USING current_setting('sintagma.staging_guard_token');

  IF NOT staging_guard_matches THEN
    RAISE EXCEPTION
      'staging guard token does not match; refusing remote execution';
  END IF;

  IF to_regclass('public.courses') IS NULL
     OR to_regclass('public.course_modules') IS NULL
     OR to_regclass('public.lessons') IS NULL
     OR to_regclass('public.test_questions') IS NULL
     OR to_regclass('public.course_documents') IS NULL
     OR to_regclass('public.library_documents') IS NULL
     OR to_regclass('public.library_folders') IS NULL
     OR to_regclass('public.enrollments') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('storage.buckets') IS NULL
     OR to_regclass('storage.objects') IS NULL
  THEN
    RAISE EXCEPTION 'Required SINTAGMA or Supabase tables are missing';
  END IF;

  IF to_regprocedure('public.can_access_organization(uuid,text)') IS NULL
     OR to_regprocedure('public.can_access_course(uuid,text)') IS NULL
  THEN
    RAISE EXCEPTION 'Required permission helpers are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'courses'
      AND column_name = 'landing_content'
      AND udt_name = 'jsonb'
  ) THEN
    RAISE EXCEPTION 'public.courses.landing_content jsonb feature gate is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'library-files'
  ) THEN
    RAISE EXCEPTION 'Required library-files bucket is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = current_setting('sintagma.protected_course_id')::uuid
      AND is_published = true
  ) THEN
    RAISE EXCEPTION
      'Protected course % is missing or is not published',
      current_setting('sintagma.protected_course_id');
  END IF;
END;
$preflight$;

CREATE TEMP TABLE course_library_before_snapshot AS
SELECT
  (
    SELECT md5(COALESCE(string_agg(to_jsonb(c)::text, E'\n' ORDER BY c.id), ''))
    FROM public.courses c
    WHERE c.id = current_setting('sintagma.protected_course_id')::uuid
  ) AS course_hash,
  (
    SELECT md5(COALESCE(string_agg(to_jsonb(cm)::text, E'\n' ORDER BY cm.id), ''))
    FROM public.course_modules cm
    WHERE cm.course_id = current_setting('sintagma.protected_course_id')::uuid
  ) AS modules_hash,
  (
    SELECT md5(COALESCE(string_agg(to_jsonb(l)::text, E'\n' ORDER BY l.id), ''))
    FROM public.lessons l
    WHERE l.course_id = current_setting('sintagma.protected_course_id')::uuid
  ) AS lessons_hash,
  (
    SELECT md5(COALESCE(string_agg(to_jsonb(tq)::text, E'\n' ORDER BY tq.id), ''))
    FROM public.test_questions tq
    JOIN public.lessons l ON l.id = tq.lesson_id
    WHERE l.course_id = current_setting('sintagma.protected_course_id')::uuid
  ) AS test_questions_hash,
  (
    SELECT md5(COALESCE(string_agg(
      jsonb_build_object(
        'id', cd.id,
        'course_id', cd.course_id,
        'name', cd.name,
        'type', cd.type,
        'description', cd.description,
        'file_url', cd.file_url,
        'created_at', cd.created_at,
        'updated_at', cd.updated_at
      )::text,
      E'\n' ORDER BY cd.id
    ), ''))
    FROM public.course_documents cd
    WHERE cd.course_id = current_setting('sintagma.protected_course_id')::uuid
  ) AS protected_course_documents_hash,
  (
    SELECT md5(COALESCE(string_agg(
      jsonb_build_object(
        'id', ld.id,
        'organization_id', ld.organization_id,
        'name', ld.name,
        'type', ld.type,
        'description', ld.description,
        'file_url', ld.file_url,
        'file_size', ld.file_size,
        'folder_id', ld.folder_id,
        'created_at', ld.created_at
      )::text,
      E'\n' ORDER BY ld.id
    ), ''))
    FROM public.library_documents ld
  ) AS legacy_library_core_hash,
  (
    SELECT count(*)
    FROM public.library_documents
  ) AS legacy_library_count,
  (
    SELECT md5(COALESCE(string_agg(to_jsonb(lf)::text, E'\n' ORDER BY lf.id), ''))
    FROM public.library_folders lf
  ) AS library_folders_hash,
  (
    SELECT md5(COALESCE(string_agg(to_jsonb(so)::text, E'\n' ORDER BY so.id), ''))
    FROM storage.objects so
    WHERE so.bucket_id = 'library-files'
  ) AS library_storage_objects_hash,
  (
    SELECT count(*)
    FROM storage.objects so
    WHERE so.bucket_id = 'library-files'
  ) AS library_storage_count;

\ir ../migrations/20260903100000_csz_electronic_library_schema.sql

DO $post_migration_contract$
DECLARE
  before_row course_library_before_snapshot%ROWTYPE;
  after_course_hash text;
  after_modules_hash text;
  after_lessons_hash text;
  after_test_questions_hash text;
  after_protected_documents_hash text;
  after_library_core_hash text;
  after_library_count bigint;
  after_library_folders_hash text;
  after_storage_objects_hash text;
  after_storage_count bigint;
BEGIN
  SELECT * INTO STRICT before_row
  FROM course_library_before_snapshot;

  SELECT md5(COALESCE(string_agg(to_jsonb(c)::text, E'\n' ORDER BY c.id), ''))
  INTO after_course_hash
  FROM public.courses c
  WHERE c.id = current_setting('sintagma.protected_course_id')::uuid;

  SELECT md5(COALESCE(string_agg(to_jsonb(cm)::text, E'\n' ORDER BY cm.id), ''))
  INTO after_modules_hash
  FROM public.course_modules cm
  WHERE cm.course_id = current_setting('sintagma.protected_course_id')::uuid;

  SELECT md5(COALESCE(string_agg(to_jsonb(l)::text, E'\n' ORDER BY l.id), ''))
  INTO after_lessons_hash
  FROM public.lessons l
  WHERE l.course_id = current_setting('sintagma.protected_course_id')::uuid;

  SELECT md5(COALESCE(string_agg(to_jsonb(tq)::text, E'\n' ORDER BY tq.id), ''))
  INTO after_test_questions_hash
  FROM public.test_questions tq
  JOIN public.lessons l ON l.id = tq.lesson_id
  WHERE l.course_id = current_setting('sintagma.protected_course_id')::uuid;

  SELECT md5(COALESCE(string_agg(
    jsonb_build_object(
      'id', cd.id,
      'course_id', cd.course_id,
      'name', cd.name,
      'type', cd.type,
      'description', cd.description,
      'file_url', cd.file_url,
      'created_at', cd.created_at,
      'updated_at', cd.updated_at
    )::text,
    E'\n' ORDER BY cd.id
  ), ''))
  INTO after_protected_documents_hash
  FROM public.course_documents cd
  WHERE cd.course_id = current_setting('sintagma.protected_course_id')::uuid;

  SELECT
    md5(COALESCE(string_agg(
      jsonb_build_object(
        'id', ld.id,
        'organization_id', ld.organization_id,
        'name', ld.name,
        'type', ld.type,
      'description', ld.description,
      'file_url', ld.file_url,
      'file_size', ld.file_size,
      'folder_id', ld.folder_id,
      'created_at', ld.created_at
      )::text,
      E'\n' ORDER BY ld.id
    ), '')),
    count(*)
  INTO after_library_core_hash, after_library_count
  FROM public.library_documents ld;

  SELECT md5(COALESCE(string_agg(to_jsonb(lf)::text, E'\n' ORDER BY lf.id), ''))
  INTO after_library_folders_hash
  FROM public.library_folders lf;

  SELECT
    md5(COALESCE(string_agg(to_jsonb(so)::text, E'\n' ORDER BY so.id), '')),
    count(*)
  INTO after_storage_objects_hash, after_storage_count
  FROM storage.objects so
  WHERE so.bucket_id = 'library-files';

  IF before_row.course_hash IS DISTINCT FROM after_course_hash
     OR before_row.modules_hash IS DISTINCT FROM after_modules_hash
     OR before_row.lessons_hash IS DISTINCT FROM after_lessons_hash
     OR before_row.test_questions_hash IS DISTINCT FROM after_test_questions_hash
     OR before_row.protected_course_documents_hash IS DISTINCT FROM after_protected_documents_hash
  THEN
    RAISE EXCEPTION 'Protected published course changed during migration dry-run';
  END IF;

  IF before_row.legacy_library_core_hash IS DISTINCT FROM after_library_core_hash
     OR before_row.legacy_library_count IS DISTINCT FROM after_library_count
  THEN
    RAISE EXCEPTION
      'Legacy library identity/content changed or disappeared; updated_at is intentionally excluded because storage_path backfill updates it';
  END IF;

  IF before_row.library_folders_hash IS DISTINCT FROM after_library_folders_hash THEN
    RAISE EXCEPTION 'Legacy library folders changed during migration dry-run';
  END IF;

  IF before_row.library_storage_objects_hash IS DISTINCT FROM after_storage_objects_hash
     OR before_row.library_storage_count IS DISTINCT FROM after_storage_count
  THEN
    RAISE EXCEPTION 'library-files objects changed during migration dry-run';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'library-files'
      AND public = true
  ) THEN
    RAISE EXCEPTION 'library-files bucket remained public';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.library_documents
    WHERE file_url LIKE '%/library-files/%'
      AND storage_path IS NULL
  ) THEN
    RAISE EXCEPTION 'A legacy library-files URL was not backfilled';
  END IF;

  IF to_regprocedure('public.can_access_course_as_learner(uuid)') IS NULL
     OR to_regprocedure('public.get_course_electronic_library_shell(uuid)') IS NULL
     OR to_regprocedure('public.get_student_dashboard_snapshot(uuid)') IS NULL
     OR to_regprocedure('public.can_read_electronic_library_document(uuid)') IS NULL
     OR to_regprocedure('public.can_read_library_file_object(text)') IS NULL
     OR to_regprocedure('public.can_manage_library_file_object(text)') IS NULL
     OR to_regprocedure('public.can_delete_orphan_library_file_object(text)') IS NULL
  THEN
    RAISE EXCEPTION 'One or more electronic-library security helpers are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'library_files_restrictive_select'
      AND permissive = 'RESTRICTIVE'
      AND 'public' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'Restrictive PUBLIC storage policy is missing';
  END IF;

  -- Verify every new column against the owning relation, PostgreSQL type,
  -- nullability and catalog-rendered default. A same-named column on another
  -- table, or a drifted IF NOT EXISTS survivor, must fail this contract.
  IF EXISTS (
    WITH expected_columns(
      schema_name,
      table_name,
      column_name,
      type_name,
      expected_not_null,
      expected_default
    ) AS (
      VALUES
        ('public', 'library_documents', 'source_name', 'text', false, NULL::text),
        ('public', 'library_documents', 'external_url', 'text', false, NULL::text),
        ('public', 'library_documents', 'storage_path', 'text', false, NULL::text),
        ('public', 'library_documents', 'original_filename', 'text', false, NULL::text),
        ('public', 'library_documents', 'mime_type', 'text', false, NULL::text),
        ('public', 'library_documents', 'edition_label', 'text', false, NULL::text),
        ('public', 'library_documents', 'last_checked_at', 'timestamp with time zone', false, NULL::text),
        ('public', 'library_documents', 'usage_basis', 'text', false, NULL::text),
        ('public', 'library_documents', 'library_status', 'text', false, NULL::text),
        ('public', 'library_documents', 'created_by', 'uuid', false, NULL::text),
        ('public', 'library_documents', 'archived_at', 'timestamp with time zone', false, NULL::text),
        ('public', 'library_documents', 'archived_by', 'uuid', false, NULL::text),
        ('public', 'course_documents', 'library_document_id', 'uuid', false, NULL::text),
        ('public', 'course_documents', 'module_id', 'uuid', false, NULL::text),
        ('public', 'course_documents', 'library_category', 'text', false, NULL::text),
        ('public', 'course_documents', 'sort_order', 'integer', true, '0'),
        ('public', 'course_documents', 'visible_to_students', 'boolean', true, 'true'),
        ('public', 'course_documents', 'allow_download', 'boolean', true, 'true')
    )
    SELECT 1
    FROM expected_columns expected
    LEFT JOIN pg_namespace namespace
      ON namespace.nspname = expected.schema_name
    LEFT JOIN pg_class relation
      ON relation.relnamespace = namespace.oid
     AND relation.relname = expected.table_name
     AND relation.relkind IN ('r', 'p')
    LEFT JOIN pg_attribute attribute
      ON attribute.attrelid = relation.oid
     AND attribute.attname = expected.column_name
     AND attribute.attnum > 0
     AND NOT attribute.attisdropped
    LEFT JOIN pg_attrdef attribute_default
      ON attribute_default.adrelid = attribute.attrelid
     AND attribute_default.adnum = attribute.attnum
    WHERE attribute.attnum IS NULL
       OR format_type(attribute.atttypid, attribute.atttypmod)
            IS DISTINCT FROM expected.type_name
       OR attribute.attnotnull IS DISTINCT FROM expected.expected_not_null
       OR pg_get_expr(
            attribute_default.adbin,
            attribute_default.adrelid,
            true
          ) IS DISTINCT FROM expected.expected_default
  ) THEN
    RAISE EXCEPTION
      'Electronic-library column ownership/type/nullability/default contract drifted';
  END IF;

  -- Constraint names are not sufficient: bind each one to its exact relation,
  -- type, validation state and catalog-rendered definition. Foreign keys also
  -- verify local/ref columns and ON DELETE behavior from pg_constraint.
  IF EXISTS (
    WITH expected_constraints(
      schema_name,
      table_name,
      constraint_name,
      constraint_type,
      expected_validated,
      definition_pattern,
      local_columns,
      referenced_relation,
      referenced_columns,
      delete_action
    ) AS (
      VALUES
        (
          'public', 'library_documents',
          'library_documents_usage_basis_check', 'c', false,
          '^CHECK .*usage_basis.*official_open_source.*own_material.*rights_holder_permission.*NOT VALID$',
          NULL::text[], NULL::text, NULL::text[], NULL::text
        ),
        (
          'public', 'library_documents',
          'library_documents_library_status_check', 'c', false,
          '^CHECK .*library_status.*active.*needs_review.*archive.*NOT VALID$',
          NULL::text[], NULL::text, NULL::text[], NULL::text
        ),
        (
          'public', 'library_documents',
          'library_documents_https_url_check', 'c', false,
          '^CHECK .*external_url.*https://.*external_url.*@.*NOT VALID$',
          NULL::text[], NULL::text, NULL::text[], NULL::text
        ),
        (
          'public', 'library_documents',
          'library_documents_single_source_check', 'c', false,
          '^CHECK .*num_nonnulls\(external_url, storage_path\).*<= 1.*NOT VALID$',
          NULL::text[], NULL::text, NULL::text[], NULL::text
        ),
        (
          'public', 'library_documents',
          'library_documents_storage_path_scope_check', 'c', false,
          '^CHECK .*storage_path.*library/.*organization_id::text.*NOT VALID$',
          NULL::text[], NULL::text, NULL::text[], NULL::text
        ),
        (
          'public', 'library_documents',
          'library_documents_active_resource_complete_check', 'c', false,
          '^CHECK .*library_status.*active.*source_name.*usage_basis.*last_checked_at.*num_nonnulls\(external_url, storage_path\).*edition_label.*NOT VALID$',
          NULL::text[], NULL::text, NULL::text[], NULL::text
        ),
        (
          'public', 'course_documents',
          'course_documents_library_document_id_fkey', 'f', true,
          '^FOREIGN KEY \(library_document_id\) REFERENCES (public\.)?library_documents\(id\) ON DELETE RESTRICT$',
          ARRAY['library_document_id'], 'public.library_documents', ARRAY['id'], 'r'
        ),
        (
          'public', 'course_documents',
          'course_documents_module_id_fkey', 'f', true,
          '^FOREIGN KEY \(module_id\) REFERENCES (public\.)?course_modules\(id\) ON DELETE SET NULL$',
          ARRAY['module_id'], 'public.course_modules', ARRAY['id'], 'n'
        ),
        (
          'public', 'course_documents',
          'course_documents_library_category_check', 'c', false,
          '^CHECK .*library_category.*legal_acts.*educational_materials.*manufacturer_guides.*additional_resources.*NOT VALID$',
          NULL::text[], NULL::text, NULL::text[], NULL::text
        ),
        (
          'public', 'course_documents',
          'course_documents_sort_order_check', 'c', false,
          '^CHECK .*sort_order.*>= 0.*NOT VALID$',
          NULL::text[], NULL::text, NULL::text[], NULL::text
        ),
        (
          'public', 'course_documents',
          'course_documents_link_category_check', 'c', false,
          '^CHECK .*library_document_id.*library_category.*NOT VALID$',
          NULL::text[], NULL::text, NULL::text[], NULL::text
        )
    ), actual_constraints AS (
      SELECT
        expected.*,
        constraint_row.oid AS constraint_oid,
        constraint_row.contype::text AS actual_type,
        constraint_row.convalidated AS actual_validated,
        constraint_row.confrelid,
        constraint_row.confdeltype::text AS actual_delete_action,
        pg_get_constraintdef(constraint_row.oid, true) AS actual_definition,
        ARRAY(
          SELECT local_attribute.attname::text
          FROM unnest(constraint_row.conkey) WITH ORDINALITY
            AS local_key(attnum, position)
          JOIN pg_attribute local_attribute
            ON local_attribute.attrelid = constraint_row.conrelid
           AND local_attribute.attnum = local_key.attnum
          ORDER BY local_key.position
        ) AS actual_local_columns,
        ARRAY(
          SELECT referenced_attribute.attname::text
          FROM unnest(constraint_row.confkey) WITH ORDINALITY
            AS referenced_key(attnum, position)
          JOIN pg_attribute referenced_attribute
            ON referenced_attribute.attrelid = constraint_row.confrelid
           AND referenced_attribute.attnum = referenced_key.attnum
          ORDER BY referenced_key.position
        ) AS actual_referenced_columns
      FROM expected_constraints expected
      LEFT JOIN pg_namespace namespace
        ON namespace.nspname = expected.schema_name
      LEFT JOIN pg_class relation
        ON relation.relnamespace = namespace.oid
       AND relation.relname = expected.table_name
       AND relation.relkind IN ('r', 'p')
      LEFT JOIN pg_constraint constraint_row
        ON constraint_row.conrelid = relation.oid
       AND constraint_row.conname = expected.constraint_name
    )
    SELECT 1
    FROM actual_constraints actual
    WHERE actual.constraint_oid IS NULL
       OR actual.actual_type IS DISTINCT FROM actual.constraint_type
       OR actual.actual_validated IS DISTINCT FROM actual.expected_validated
       OR actual.actual_definition IS NULL
       OR actual.actual_definition !~* actual.definition_pattern
       OR (
         actual.constraint_type = 'f'
         AND (
           actual.actual_local_columns IS DISTINCT FROM actual.local_columns
           OR actual.confrelid IS DISTINCT FROM to_regclass(actual.referenced_relation)
           OR actual.actual_referenced_columns IS DISTINCT FROM actual.referenced_columns
           OR actual.actual_delete_action IS DISTINCT FROM actual.delete_action
         )
       )
  ) THEN
    RAISE EXCEPTION
      'Electronic-library constraint ownership or pg_get_constraintdef contract drifted';
  END IF;

  -- Trigger checks bind the name to the exact table and function, and verify
  -- BEFORE + ROW + INSERT/UPDATE (tgtype=23) plus pg_get_triggerdef output.
  IF EXISTS (
    WITH expected_triggers(
      schema_name,
      table_name,
      trigger_name,
      function_name,
      normalized_definition
    ) AS (
      VALUES
        (
          'public', 'library_documents',
          'validate_library_document_scope_trigger',
          'validate_library_document_scope',
          'createtriggervalidate_library_document_scope_triggerbeforeinsertorupdateonlibrary_documentsforeachrowexecutefunctionvalidate_library_document_scope()'
        ),
        (
          'public', 'library_folders',
          'validate_library_folder_scope_trigger',
          'validate_library_folder_scope',
          'createtriggervalidate_library_folder_scope_triggerbeforeinsertorupdateonlibrary_foldersforeachrowexecutefunctionvalidate_library_folder_scope()'
        ),
        (
          'public', 'course_documents',
          'validate_course_library_assignment_scope_trigger',
          'validate_course_library_assignment_scope',
          'createtriggervalidate_course_library_assignment_scope_triggerbeforeinsertorupdateoncourse_documentsforeachrowexecutefunctionvalidate_course_library_assignment_scope()'
        )
    )
    SELECT 1
    FROM expected_triggers expected
    LEFT JOIN pg_namespace relation_namespace
      ON relation_namespace.nspname = expected.schema_name
    LEFT JOIN pg_class relation
      ON relation.relnamespace = relation_namespace.oid
     AND relation.relname = expected.table_name
     AND relation.relkind IN ('r', 'p')
    LEFT JOIN pg_trigger trigger_row
      ON trigger_row.tgrelid = relation.oid
     AND trigger_row.tgname = expected.trigger_name
     AND NOT trigger_row.tgisinternal
    LEFT JOIN pg_proc trigger_function
      ON trigger_function.oid = trigger_row.tgfoid
    LEFT JOIN pg_namespace function_namespace
      ON function_namespace.oid = trigger_function.pronamespace
    WHERE trigger_row.oid IS NULL
       OR trigger_row.tgtype <> 23
       OR trigger_row.tgenabled <> 'O'
       OR trigger_row.tgnargs <> 0
       OR trigger_row.tgconstraint <> 0
       OR function_namespace.nspname IS DISTINCT FROM expected.schema_name
       OR trigger_function.proname IS DISTINCT FROM expected.function_name
       OR regexp_replace(
            replace(lower(pg_get_triggerdef(trigger_row.oid, true)), 'public.', ''),
            '[[:space:]\"]+',
            '',
            'g'
          ) IS DISTINCT FROM expected.normalized_definition
  ) THEN
    RAISE EXCEPTION
      'Electronic-library trigger ownership or pg_get_triggerdef contract drifted';
  END IF;

  -- Verify relation ownership, btree method, key order, uniqueness, absence of
  -- INCLUDE/expression drift, predicate and complete pg_get_indexdef output.
  IF EXISTS (
    WITH expected_indexes(
      schema_name,
      table_name,
      index_name,
      is_unique,
      key_columns,
      normalized_predicate,
      normalized_definition
    ) AS (
      VALUES
        (
          'public', 'course_documents', 'idx_course_documents_course_id', false,
          ARRAY['course_id'], '',
          'createindexidx_course_documents_course_idonpublic.course_documentsusingbtree(course_id)'
        ),
        (
          'public', 'course_documents',
          'idx_course_documents_library_document_id', false,
          ARRAY['library_document_id'], 'library_document_idisnotnull',
          'createindexidx_course_documents_library_document_idonpublic.course_documentsusingbtree(library_document_id)where(library_document_idisnotnull)'
        ),
        (
          'public', 'course_documents', 'idx_course_documents_module_id', false,
          ARRAY['module_id'], 'module_idisnotnull',
          'createindexidx_course_documents_module_idonpublic.course_documentsusingbtree(module_id)where(module_idisnotnull)'
        ),
        (
          'public', 'course_documents',
          'idx_course_documents_library_listing', false,
          ARRAY['course_id', 'visible_to_students', 'sort_order'],
          'library_document_idisnotnull',
          'createindexidx_course_documents_library_listingonpublic.course_documentsusingbtree(course_id,visible_to_students,sort_order)where(library_document_idisnotnull)'
        ),
        (
          'public', 'library_documents',
          'idx_library_documents_storage_path', false,
          ARRAY['storage_path'], 'storage_pathisnotnull',
          'createindexidx_library_documents_storage_pathonpublic.library_documentsusingbtree(storage_path)where(storage_pathisnotnull)'
        ),
        (
          'public', 'course_documents',
          'uq_course_documents_course_library_document', true,
          ARRAY['course_id', 'library_document_id'],
          'library_document_idisnotnull',
          'createuniqueindexuq_course_documents_course_library_documentonpublic.course_documentsusingbtree(course_id,library_document_id)where(library_document_idisnotnull)'
        )
    )
    SELECT 1
    FROM expected_indexes expected
    LEFT JOIN pg_namespace relation_namespace
      ON relation_namespace.nspname = expected.schema_name
    LEFT JOIN pg_class relation
      ON relation.relnamespace = relation_namespace.oid
     AND relation.relname = expected.table_name
     AND relation.relkind IN ('r', 'p')
    LEFT JOIN pg_namespace index_namespace
      ON index_namespace.nspname = expected.schema_name
    LEFT JOIN pg_class index_relation
      ON index_relation.relnamespace = index_namespace.oid
     AND index_relation.relname = expected.index_name
     AND index_relation.relkind = 'i'
    LEFT JOIN pg_index index_row
      ON index_row.indexrelid = index_relation.oid
     AND index_row.indrelid = relation.oid
    LEFT JOIN pg_am access_method
      ON access_method.oid = index_relation.relam
    WHERE index_row.indexrelid IS NULL
       OR access_method.amname IS DISTINCT FROM 'btree'
       OR index_row.indisunique IS DISTINCT FROM expected.is_unique
       OR NOT index_row.indisvalid
       OR NOT index_row.indisready
       OR index_row.indisprimary
       OR index_row.indisexclusion
       OR index_row.indexprs IS NOT NULL
       OR index_row.indnkeyatts <> cardinality(expected.key_columns)
       OR index_row.indnatts <> index_row.indnkeyatts
       OR ARRAY(
            SELECT pg_get_indexdef(
              index_row.indexrelid,
              key_position,
              true
            )
            FROM generate_series(1, index_row.indnkeyatts) key_position
          ) IS DISTINCT FROM expected.key_columns
       OR regexp_replace(
            lower(COALESCE(
              pg_get_expr(index_row.indpred, index_row.indrelid, true),
              ''
            )),
            '[[:space:]()]',
            '',
            'g'
          ) IS DISTINCT FROM expected.normalized_predicate
       OR regexp_replace(
            lower(pg_get_indexdef(index_row.indexrelid)),
            '[[:space:]\"]+',
            '',
            'g'
          ) IS DISTINCT FROM expected.normalized_definition
  ) THEN
    RAISE EXCEPTION
      'Electronic-library index ownership/uniqueness/predicate/pg_get_indexdef contract drifted';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE (namespace.nspname, relation.relname) IN (
      ('public', 'library_documents'),
      ('public', 'library_folders'),
      ('public', 'course_documents'),
      ('storage', 'objects')
    )
      AND NOT relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS is not enabled on every protected relation';
  END IF;

  IF EXISTS (
    SELECT expected.policyname
    FROM unnest(ARRAY[
      'library_documents_select',
      'library_documents_insert',
      'library_documents_update',
      'library_folders_select',
      'library_folders_insert',
      'library_folders_update',
      'library_folders_delete',
      'course_library_unpublished_course_guard',
      'course_library_unpublished_module_guard',
      'course_documents_select',
      'course_documents_insert',
      'course_documents_update',
      'course_documents_delete_legacy'
    ]) AS expected(policyname)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_policies policy
      WHERE policy.schemaname = 'public'
        AND policy.policyname = expected.policyname
    )
  ) THEN
    RAISE EXCEPTION 'One or more table RLS policies are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'courses'
      AND policy.policyname = 'course_library_unpublished_course_guard'
      AND policy.cmd = 'SELECT'
      AND policy.permissive = 'RESTRICTIVE'
      AND 'authenticated' = ANY(policy.roles)
  ) THEN
    RAISE EXCEPTION
      'Unpublished electronic-library course guard is missing or misclassified';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'course_modules'
      AND policy.policyname = 'course_library_unpublished_module_guard'
      AND policy.cmd = 'SELECT'
      AND policy.permissive = 'RESTRICTIVE'
      AND 'authenticated' = ANY(policy.roles)
  ) THEN
    RAISE EXCEPTION
      'Unpublished electronic-library module guard is missing or misclassified';
  END IF;

  IF EXISTS (
    SELECT expected.policyname
    FROM unnest(ARRAY[
      'library_files_private_select',
      'library_files_private_insert',
      'library_files_private_update',
      'library_files_private_delete',
      'library_files_restrictive_select',
      'library_files_restrictive_insert',
      'library_files_restrictive_update',
      'library_files_restrictive_delete'
    ]) AS expected(policyname)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_policies policy
      WHERE policy.schemaname = 'storage'
        AND policy.tablename = 'objects'
        AND policy.policyname = expected.policyname
    )
  ) THEN
    RAISE EXCEPTION 'One or more private Storage policies are missing';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE 'library_files_restrictive_%'
      AND permissive = 'RESTRICTIVE'
      AND 'public' = ANY(roles)
  ) <> 4 THEN
    RAISE EXCEPTION 'All four Storage commands require restrictive PUBLIC guards';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'library_documents'
      AND cmd = 'DELETE'
      AND 'authenticated' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'Authenticated DELETE must remain disabled for canonical library documents';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.courses
    WHERE id = current_setting('sintagma.protected_course_id')::uuid
      AND is_published = true
  ) THEN
    RAISE EXCEPTION 'Protected course is no longer published';
  END IF;
END;
$post_migration_contract$;

ROLLBACK;

SELECT
  'PASS - migration verified and transaction successfully rolled back' AS result,
  :'protected_course_id' AS protected_course_id;
