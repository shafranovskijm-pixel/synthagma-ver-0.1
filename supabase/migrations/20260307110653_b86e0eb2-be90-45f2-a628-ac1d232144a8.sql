
-- Trigger function to automatically log audit events
CREATE OR REPLACE FUNCTION public.auto_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_user_name text;
  v_org_id uuid;
  v_entity_name text;
  v_action text;
  v_entity_type text;
  v_entity_id text;
  v_details jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Get user name
  SELECT COALESCE(full_name, email, 'Unknown') INTO v_user_name
  FROM profiles WHERE user_id = v_user_id LIMIT 1;

  -- Determine action
  v_action := CASE TG_OP
    WHEN 'INSERT' THEN 'create'
    WHEN 'UPDATE' THEN 'update'
    WHEN 'DELETE' THEN 'delete'
  END;

  -- Table-specific logic
  IF TG_TABLE_NAME = 'courses' THEN
    v_entity_type := 'course';
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.organization_id;
      v_entity_id := OLD.id::text;
      v_entity_name := OLD.title;
    ELSE
      v_org_id := NEW.organization_id;
      v_entity_id := NEW.id::text;
      v_entity_name := NEW.title;
      IF TG_OP = 'UPDATE' AND OLD.is_published IS DISTINCT FROM NEW.is_published THEN
        v_action := CASE WHEN NEW.is_published THEN 'update' ELSE 'update' END;
        v_details := jsonb_build_object('published', NEW.is_published);
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'enrollments' THEN
    v_entity_type := 'enrollment';
    IF TG_OP = 'DELETE' THEN
      v_entity_id := OLD.id::text;
      SELECT organization_id INTO v_org_id FROM courses WHERE id = OLD.course_id LIMIT 1;
      SELECT COALESCE(p.full_name, p.email) INTO v_entity_name FROM profiles p WHERE p.user_id = OLD.user_id LIMIT 1;
    ELSE
      v_entity_id := NEW.id::text;
      SELECT organization_id INTO v_org_id FROM courses WHERE id = NEW.course_id LIMIT 1;
      SELECT COALESCE(p.full_name, p.email) INTO v_entity_name FROM profiles p WHERE p.user_id = NEW.user_id LIMIT 1;
    END IF;

  ELSIF TG_TABLE_NAME = 'profiles' THEN
    v_entity_type := 'student';
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.organization_id;
      v_entity_id := OLD.user_id::text;
      v_entity_name := COALESCE(OLD.full_name, OLD.email);
    ELSE
      v_org_id := NEW.organization_id;
      v_entity_id := NEW.user_id::text;
      v_entity_name := COALESCE(NEW.full_name, NEW.email);
      -- Skip trivial updates (last_visit_at only)
      IF TG_OP = 'UPDATE' AND OLD.full_name IS NOT DISTINCT FROM NEW.full_name 
         AND OLD.email IS NOT DISTINCT FROM NEW.email
         AND OLD.login IS NOT DISTINCT FROM NEW.login
         AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
         AND OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
        RETURN NEW;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'companies' THEN
    v_entity_type := 'company';
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.organization_id;
      v_entity_id := OLD.id::text;
      v_entity_name := OLD.name;
    ELSE
      v_org_id := NEW.organization_id;
      v_entity_id := NEW.id::text;
      v_entity_name := NEW.name;
    END IF;

  ELSIF TG_TABLE_NAME = 'course_documents' THEN
    v_entity_type := 'document';
    IF TG_OP = 'DELETE' THEN
      v_entity_id := OLD.id::text;
      v_entity_name := OLD.name;
      SELECT organization_id INTO v_org_id FROM courses WHERE id = OLD.course_id LIMIT 1;
    ELSE
      v_entity_id := NEW.id::text;
      v_entity_name := NEW.name;
      SELECT organization_id INTO v_org_id FROM courses WHERE id = NEW.course_id LIMIT 1;
    END IF;

  ELSIF TG_TABLE_NAME = 'registration_links' THEN
    v_entity_type := 'link';
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.organization_id;
      v_entity_id := OLD.id::text;
      v_entity_name := OLD.name;
    ELSE
      v_org_id := NEW.organization_id;
      v_entity_id := NEW.id::text;
      v_entity_name := NEW.name;
    END IF;

  ELSIF TG_TABLE_NAME = 'journal_instances' THEN
    v_entity_type := 'journal';
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.organization_id;
      v_entity_id := OLD.id::text;
      v_entity_name := OLD.title;
    ELSE
      v_org_id := NEW.organization_id;
      v_entity_id := NEW.id::text;
      v_entity_name := NEW.title;
    END IF;

  ELSIF TG_TABLE_NAME = 'education_document_records' THEN
    v_entity_type := 'document';
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.organization_id;
      v_entity_id := OLD.id::text;
      v_entity_name := OLD.full_name || ' — ' || OLD.document_type;
    ELSE
      v_org_id := NEW.organization_id;
      v_entity_id := NEW.id::text;
      v_entity_name := NEW.full_name || ' — ' || NEW.document_type;
    END IF;

  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Only log if we have an org_id
  IF v_org_id IS NOT NULL THEN
    INSERT INTO audit_logs (organization_id, user_id, user_name, action_type, entity_type, entity_id, entity_name, details, user_agent)
    VALUES (v_org_id, v_user_id, v_user_name, v_action, v_entity_type, v_entity_id, v_entity_name, v_details, NULL);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers to key tables
CREATE TRIGGER audit_courses
  AFTER INSERT OR UPDATE OR DELETE ON courses
  FOR EACH ROW EXECUTE FUNCTION auto_audit_log();

CREATE TRIGGER audit_enrollments
  AFTER INSERT OR DELETE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION auto_audit_log();

CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION auto_audit_log();

CREATE TRIGGER audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION auto_audit_log();

CREATE TRIGGER audit_course_documents
  AFTER INSERT OR DELETE ON course_documents
  FOR EACH ROW EXECUTE FUNCTION auto_audit_log();

CREATE TRIGGER audit_registration_links
  AFTER INSERT OR DELETE ON registration_links
  FOR EACH ROW EXECUTE FUNCTION auto_audit_log();

CREATE TRIGGER audit_journal_instances
  AFTER INSERT OR DELETE ON journal_instances
  FOR EACH ROW EXECUTE FUNCTION auto_audit_log();

CREATE TRIGGER audit_education_documents
  AFTER INSERT OR UPDATE OR DELETE ON education_document_records
  FOR EACH ROW EXECUTE FUNCTION auto_audit_log();
