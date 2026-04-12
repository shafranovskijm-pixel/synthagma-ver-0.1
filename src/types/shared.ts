// Centralized shared types for organization-related entities
// These are simplified view-model types used across the app.
// For full DB types, see student.ts, course.ts, organization.ts.

export type { Student, StudentDocument, TestAttempt, TestQuestion, StudentDetails } from './student';

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
  skip_video_identification?: boolean;
  cover_image_url?: string | null;
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
