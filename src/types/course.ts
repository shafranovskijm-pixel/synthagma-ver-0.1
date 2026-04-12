// Course types
export interface Course {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  created_at: string;
  updated_at?: string;
  organization_id?: string;
  category_id?: string | null;
  duration?: string | null;
  skip_video_identification?: boolean;
  sequential_lessons?: boolean;
  allow_video_seek?: boolean;
  training_form?: string | null;
  notify_on_completion?: boolean;
  completion_notify_emails?: string | null;
  cover_image_url?: string | null;
  // Computed fields
  lessonsCount?: number;
  studentsCount?: number;
  catalog_order?: number;
}

export interface CourseCategory {
  id: string;
  name: string;
  color: string | null;
  organization_id: string;
  created_at: string;
}

export interface Lesson {
  id: string;
  course_id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  test_questions_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface LessonProgress {
  id: string;
  user_id: string;
  lesson_id: string;
  completed: boolean;
  completed_at: string | null;
  time_spent: number;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  status: string;
  progress: number;
  time_spent: number;
  started_at: string;
  completed_at: string | null;
}

export interface CourseDocument {
  id: string;
  course_id: string;
  name: string;
  type: string;
  description: string | null;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceCourse {
  id: string;
  course_id: string;
  organization_id: string;
  price_student: number;
  price_organization: number;
  description_short: string | null;
  preview_image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type CourseFilter = "all" | "published" | "draft";
export type CourseViewMode = "grid" | "list";
