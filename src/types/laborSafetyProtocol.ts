export interface LaborSafetyEnrollmentProtocol {
  id: string;
  organization_id: string;
  enrollment_id: string | null;
  source_enrollment_id: string;
  source_user_id: string;
  source_course_id: string;
  learner_name_snapshot: string | null;
  course_title_snapshot: string;
  protocol_number: string;
  knowledge_check_date: string;
  is_passed: boolean;
  version: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}
