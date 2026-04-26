// Student types
export interface Student {
  id: string;
  user_id: string;
  enrollment_id: string | null;
  name: string;
  email: string;
  login: string | null;
  generated_password: string | null;
  course: string | null;
  course_id: string | null;
  progress: number;
  lastActivity: string | null;
  last_visit_at?: string | null;
  status: string | null;
  company_id?: string | null;
  company_name?: string | null;
  enrollments?: StudentEnrollment[]; // All enrollments for this student
  archived_at?: string | null; // Manual archive timestamp (profiles.archived_at)
}

export interface StudentDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
}

export interface StudentIdentityDocument {
  id: string;
  user_id: string;
  organization_id: string;
  type: string;
  name: string;
  file_url: string | null;
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentFRDOData {
  id: string;
  user_id: string;
  organization_id: string;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  birth_date: string | null;
  gender: string | null;
  snils: string | null;
  citizenship_code: string | null;
  education_level: string | null;
  education_doc_series: string | null;
  education_doc_number: string | null;
  education_doc_last_name: string | null;
  training_form: string | null;
  education_form: string | null;
  financing_source: string | null;
  specialty_group: string | null;
  professional_area: string | null;
  profession_name: string | null;
  qualification_name: string | null;
  qualification_rank: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentFRDOStatus {
  hasData: boolean;
  isComplete: boolean;
  missingFields: string[];
}

export interface StudentDetails {
  student: Student;
  documents: StudentDocument[];
  testAttempts: TestAttempt[];
}

export interface TestAttempt {
  id: string;
  lesson_id: string;
  lesson_title: string;
  score: number;
  max_score: number;
  completed_at: string;
  answers: Record<string, number>;
}

export interface TestQuestion {
  id: string;
  question: string;
  options: string[];
  correct_answer: number;
  order_index: number;
}

export interface StudentConsent {
  id: string;
  user_id: string;
  organization_id: string;
  enrollment_id: string | null;
  consent_type: string;
  status: string;
  signed_at: string | null;
  full_name: string | null;
  passport_data: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentEnrollment {
  id: string;
  course_id: string;
  course_title: string;
  progress: number;
  status: string;
  started_at: string;
  completed_at?: string | null;
  time_spent: number;
}

export type StudentStatusFilter = "all" | "active" | "completed" | "not_enrolled";
export type StudentDocsFilter = "all" | "complete" | "no_passport" | "no_snils" | "no_education" | "incomplete";
