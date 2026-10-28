export interface Lesson {
  id: string;
  course_id?: string | null;
  title: string;
  type: string;
  content?: string | null;
  order_index: number;
  module_id?: string | null;
  is_locked?: boolean;
  locked_until?: string | null;
  ai_avatar_name?: string | null;
  ai_avatar_image_url?: string | null;
  ai_avatar_voice_id?: string | null;
  ai_avatar_system_prompt?: string | null;
  ai_avatar_greeting?: string | null;
  ai_avatar_subject?: string | null;
  ai_avatar_style?: string | null;
  ai_avatar_session_minutes?: number | null;
  ai_avatar_model?: string | null;
}

export interface Course {
  id: string;
  organization_id?: string | null;
  title: string;
  description: string | null;
  duration: string | null;
  sequential_lessons?: boolean;
  allow_video_seek?: boolean;
  allow_materials_download?: boolean | null;
  skip_video_identification?: boolean | null;
  require_final_test_photo?: boolean;
  landing_content?: unknown;
}

export interface LessonProgress {
  lesson_id: string;
  completed: boolean;
}

export interface TestQuestion {
  id: string;
  question: string;
  options: unknown;
  correct_answer?: number | null;
  order_index: number;
  explanation?: string;
  is_bank_question?: boolean;
  image_url?: string;
}

export const getOptionText = (option: unknown): string => {
  if (typeof option === 'object' && option !== null && 'text' in option) {
    return (option as { text: string }).text;
  }
  return String(option);
};

/** Stable target assignment metadata; a locator is never delivery authority. */
export interface CourseMaterialFile {
  id: string; course_id: string; organization_id: string | null;
  lesson_id: string | null; module_id: string | null;
  reference_kind: "course_document" | "lesson_attachment";
  name: string; file_url: string | null; file_type: string | null; file_size: number | null;
  category: string; visible_to_students: boolean; allow_download: boolean;
  library_document_id?: string | null; library_category?: string | null;
}
