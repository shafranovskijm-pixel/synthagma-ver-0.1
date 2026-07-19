
-- 1) Fix FK violation on saving new template versions.
-- Split snapshot trigger: BEFORE sets NEW.version; AFTER writes version row (after parent row exists).
DROP TRIGGER IF EXISTS trg_snapshot_contract_template ON public.org_contract_templates;

CREATE OR REPLACE FUNCTION public.contract_template_bump_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.body_html = NEW.body_html AND OLD.name = NEW.name THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
    FROM org_contract_template_versions WHERE template_id = NEW.id;
  NEW.version := v_next;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.contract_template_write_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_user_name text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.body_html = NEW.body_html AND OLD.name = NEW.name THEN
    RETURN NEW;
  END IF;
  v_user := auth.uid();
  IF v_user IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_user_name FROM profiles WHERE user_id = v_user LIMIT 1;
  END IF;
  INSERT INTO org_contract_template_versions (
    template_id, organization_id, version, name, body_html, variables, created_by, created_by_name
  ) VALUES (
    NEW.id, NEW.organization_id, NEW.version, NEW.name, NEW.body_html, NEW.variables, v_user, v_user_name
  )
  ON CONFLICT (template_id, version) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_contract_template_version
  BEFORE INSERT OR UPDATE ON public.org_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.contract_template_bump_version();

CREATE TRIGGER trg_write_contract_template_version
  AFTER INSERT OR UPDATE ON public.org_contract_templates
  FOR EACH ROW EXECUTE FUNCTION public.contract_template_write_version();

-- 2) Storage of training plans per course/program (one plan per course).
CREATE TABLE IF NOT EXISTS public.program_training_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title text,
  hours integer,
  form text,
  plan_html text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id)
);

CREATE INDEX IF NOT EXISTS idx_program_training_plans_org ON public.program_training_plans(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_training_plans TO authenticated;
GRANT ALL ON public.program_training_plans TO service_role;

ALTER TABLE public.program_training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage own training plans"
  ON public.program_training_plans FOR ALL
  TO authenticated
  USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE TRIGGER trg_program_training_plans_updated_at
  BEFORE UPDATE ON public.program_training_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Atomic next-number RPC for contract auto-numbering.
CREATE OR REPLACE FUNCTION public.get_next_document_number(
  p_org uuid,
  p_doc_type text,
  p_year integer DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);
  v_next int;
BEGIN
  IF p_org IS NULL OR p_doc_type IS NULL THEN
    RAISE EXCEPTION 'organization_id and doc_type are required';
  END IF;
  IF NOT (has_role('admin'::app_role, auth.uid())
          OR p_org = current_organization_id()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO document_number_sequences(organization_id, doc_type, year, last_number)
  VALUES (p_org, p_doc_type, v_year, 1)
  ON CONFLICT (organization_id, doc_type, year)
  DO UPDATE SET last_number = document_number_sequences.last_number + 1,
                updated_at = now()
  RETURNING last_number INTO v_next;

  RETURN v_next;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_document_number(uuid, text, integer) TO authenticated;
