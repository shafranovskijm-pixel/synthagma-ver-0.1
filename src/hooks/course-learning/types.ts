export interface Lesson {
  id: string;
  title: string;
  type: string;
  content: string | null;
  order_index: number;
  is_locked?: boolean;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  duration: string | null;
  sequential_lessons?: boolean;
  allow_video_seek?: boolean;
  skip_video_identification?: boolean;
}

export interface LessonProgress {
  lesson_id: string;
  completed: boolean;
}

export interface TestQuestion {
  id: string;
  question: string;
  options: unknown;
  correct_answer: number;
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
