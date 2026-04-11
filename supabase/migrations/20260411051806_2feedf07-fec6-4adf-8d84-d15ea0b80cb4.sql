
CREATE OR REPLACE FUNCTION public.auto_create_education_document()
RETURNS TRIGGER AS $$
DECLARE
  v_course RECORD;
  v_profile RECORD;
  v_frdo RECORD;
  v_doc_type text;
  v_org_id uuid;
  v_existing_count integer;
  v_year integer;
  v_reg_number text;
  v_doc_number text;
BEGIN
  -- Only when status changes to completed
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    -- Get course info
    SELECT id, title, organization_id, frdo_program_type, frdo_qualification_name
    INTO v_course
    FROM courses
    WHERE id = NEW.course_id;

    IF v_course IS NULL THEN RETURN NEW; END IF;

    -- Only auto-create if frdo_program_type is set
    IF v_course.frdo_program_type IS NULL THEN RETURN NEW; END IF;

    -- Map program type to document type
    v_doc_type := CASE v_course.frdo_program_type
      WHEN 'qualification_upgrade' THEN 'certificate'
      WHEN 'professional_retraining' THEN 'diploma'
      WHEN 'professional_training' THEN 'qualification'
      ELSE NULL
    END;

    IF v_doc_type IS NULL THEN RETURN NEW; END IF;

    v_org_id := v_course.organization_id;

    -- Check if record already exists for this enrollment
    IF EXISTS (
      SELECT 1 FROM education_document_records
      WHERE enrollment_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;

    -- Get student profile
    SELECT full_name, email INTO v_profile
    FROM profiles WHERE user_id = NEW.user_id LIMIT 1;

    -- Get birth date from FRDO data
    SELECT birth_date INTO v_frdo
    FROM student_frdo_data WHERE user_id = NEW.user_id LIMIT 1;

    -- Generate numbers
    v_year := EXTRACT(YEAR FROM now())::integer;
    SELECT COUNT(*) INTO v_existing_count
    FROM education_document_records
    WHERE organization_id = v_org_id
      AND EXTRACT(YEAR FROM issue_date::date) = v_year;

    v_existing_count := v_existing_count + 1;
    v_reg_number := 'ДОК-' || v_year || '/' || lpad(v_existing_count::text, 4, '0');
    v_doc_number := v_year || '/' || lpad(v_existing_count::text, 6, '0');

    INSERT INTO education_document_records (
      organization_id, enrollment_id, full_name, birth_date,
      document_type, document_number, reg_number, issue_date,
      specialty_name, qualification_name, document_status, delivery_method
    ) VALUES (
      v_org_id, NEW.id,
      COALESCE(v_profile.full_name, v_profile.email, 'Неизвестный'),
      v_frdo.birth_date,
      v_doc_type, v_doc_number, v_reg_number,
      CURRENT_DATE::text,
      v_course.title,
      v_course.frdo_qualification_name,
      'original', 'personal'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

CREATE TRIGGER trigger_auto_create_education_document
  AFTER UPDATE ON public.enrollments
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed'))
  EXECUTE FUNCTION public.auto_create_education_document();
