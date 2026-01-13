// Centralized shared types for organization-related entities

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
  status: string | null;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  lessonsCount?: number;
  studentsCount?: number;
  duration?: string;
  category_id?: string | null;
}

export interface CourseCategory {
  id: string;
  name: string;
  color: string;
}

export interface Company {
  id: string;
  name: string;
  inn: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  address?: string | null;
  director?: string | null;
  organization_id?: string;
  signature_url?: string | null;
  stamp_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface StudentDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
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

export interface StudentDetails {
  student: Student;
  documents: StudentDocument[];
  testAttempts: TestAttempt[];
}

export interface Stats {
  totalStudents: number;
  totalCourses: number;
  completedCount: number;
  averageProgress: number;
}

export interface DocumentsStats {
  total: number;
  withPassport: number;
  withSnils: number;
  withEducation: number;
  complete: number;
}

export interface FrdoStatus {
  userId: string;
  hasData: boolean;
}
