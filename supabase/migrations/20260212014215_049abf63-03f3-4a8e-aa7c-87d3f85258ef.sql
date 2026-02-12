
-- =====================================================
-- FIX 1: Restrict course-files storage upload/delete to org/admin only
-- =====================================================

DROP POLICY IF EXISTS "Authenticated users can upload course files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own course files" ON storage.objects;

CREATE POLICY "Org users can upload course files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'course-files'
  AND (
    has_role('organization'::app_role, auth.uid())
    OR has_role('admin'::app_role, auth.uid())
  )
);

CREATE POLICY "Org users can delete course files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'course-files'
  AND (
    has_role('organization'::app_role, auth.uid())
    OR has_role('admin'::app_role, auth.uid())
  )
);

-- =====================================================
-- FIX 2: Restrict student_documents policies to authenticated
-- =====================================================

DROP POLICY IF EXISTS "Org users can manage student documents" ON student_documents;
DROP POLICY IF EXISTS "Users can view own documents" ON student_documents;

CREATE POLICY "Org users can manage student documents"
ON student_documents FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
  WHERE e.id = student_documents.enrollment_id
  AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
  WHERE e.id = student_documents.enrollment_id
  AND (c.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
));

CREATE POLICY "Users can view own documents"
ON student_documents FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM enrollments e
  WHERE e.id = student_documents.enrollment_id AND e.user_id = auth.uid()
));

-- =====================================================
-- FIX 3: Restrict student_identity_documents policies to authenticated
-- =====================================================

DROP POLICY IF EXISTS "Org users can manage student identity documents" ON student_identity_documents;
DROP POLICY IF EXISTS "Students can view own identity documents" ON student_identity_documents;

CREATE POLICY "Org users can manage student identity documents"
ON student_identity_documents FOR ALL TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Students can view own identity documents"
ON student_identity_documents FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- FIX 4: Restrict consent_documents policies to authenticated
-- =====================================================

DROP POLICY IF EXISTS "Org users can view their consent documents" ON consent_documents;
DROP POLICY IF EXISTS "Org users can insert consent documents" ON consent_documents;
DROP POLICY IF EXISTS "Org users can delete their consent documents" ON consent_documents;

CREATE POLICY "Org users can view consent documents"
ON consent_documents FOR SELECT TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can insert consent documents"
ON consent_documents FOR INSERT TO authenticated
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can delete consent documents"
ON consent_documents FOR DELETE TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- =====================================================
-- FIX 5: Restrict course_reminders policies to authenticated
-- =====================================================

DROP POLICY IF EXISTS "Org users can manage course reminders" ON course_reminders;
DROP POLICY IF EXISTS "Org users can view course reminders" ON course_reminders;
DROP POLICY IF EXISTS "Students can view own course reminders" ON course_reminders;

CREATE POLICY "Org users can manage course reminders"
ON course_reminders FOR ALL TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can view course reminders"
ON course_reminders FOR SELECT TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Students can view own course reminders"
ON course_reminders FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- FIX 6: Restrict organization_comments policies to authenticated
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage organization comments" ON organization_comments;

CREATE POLICY "Admins can manage organization comments"
ON organization_comments FOR ALL TO authenticated
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));

-- =====================================================
-- FIX 7: Restrict organization_reminders policies to authenticated
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage organization reminders" ON organization_reminders;

CREATE POLICY "Admins can manage organization reminders"
ON organization_reminders FOR ALL TO authenticated
USING (has_role('admin'::app_role, auth.uid()))
WITH CHECK (has_role('admin'::app_role, auth.uid()));

-- =====================================================
-- FIX 8: Restrict audit_logs policies to authenticated
-- =====================================================

DROP POLICY IF EXISTS "Org users can view their audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Org users can insert audit logs" ON audit_logs;

CREATE POLICY "Org users can view their audit logs"
ON audit_logs FOR SELECT TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can insert audit logs"
ON audit_logs FOR INSERT TO authenticated
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- =====================================================
-- FIX 9: Restrict system_diagnostics policies to authenticated
-- =====================================================

DROP POLICY IF EXISTS "Org users can manage their diagnostics" ON system_diagnostics;
DROP POLICY IF EXISTS "Org users can view their diagnostics" ON system_diagnostics;

CREATE POLICY "Org users can manage their diagnostics"
ON system_diagnostics FOR ALL TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

CREATE POLICY "Org users can view their diagnostics"
ON system_diagnostics FOR SELECT TO authenticated
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));
