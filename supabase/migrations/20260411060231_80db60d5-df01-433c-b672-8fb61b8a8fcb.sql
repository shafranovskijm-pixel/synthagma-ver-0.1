
-- Backfill: create records for already completed enrollments that don't have records yet
INSERT INTO education_document_records (
  organization_id, enrollment_id, full_name, birth_date,
  document_type, document_number, reg_number, issue_date,
  specialty_name, qualification_name, document_status, delivery_method
)
SELECT
  c.organization_id,
  e.id,
  COALESCE(p.full_name, p.email, 'Неизвестный'),
  sfd.birth_date,
  CASE c.frdo_program_type
    WHEN 'qualification_upgrade' THEN 'certificate'
    WHEN 'professional_retraining' THEN 'diploma'
    WHEN 'professional_training' THEN 'qualification'
    ELSE 'certificate'
  END,
  EXTRACT(YEAR FROM now())::int::text || '/' || lpad(
    (ROW_NUMBER() OVER (PARTITION BY c.organization_id ORDER BY e.completed_at) +
     COALESCE((SELECT COUNT(*) FROM education_document_records edr WHERE edr.organization_id = c.organization_id), 0)
    )::text, 6, '0'),
  'ДОК-' || EXTRACT(YEAR FROM now())::int::text || '/' || lpad(
    (ROW_NUMBER() OVER (PARTITION BY c.organization_id ORDER BY e.completed_at) +
     COALESCE((SELECT COUNT(*) FROM education_document_records edr WHERE edr.organization_id = c.organization_id), 0)
    )::text, 4, '0'),
  CURRENT_DATE,
  c.title,
  c.frdo_qualification_name,
  'original',
  'personal'
FROM enrollments e
JOIN courses c ON c.id = e.course_id
LEFT JOIN profiles p ON p.user_id = e.user_id
LEFT JOIN student_frdo_data sfd ON sfd.user_id = e.user_id
WHERE e.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM education_document_records edr WHERE edr.enrollment_id = e.id
  );
