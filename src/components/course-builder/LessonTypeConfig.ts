import type { LucideIcon } from "lucide-react";
import {
  FileText, Video, Image, FileQuestion, Headphones, Presentation, ClipboardList, MessageSquare, BookCheck, Sparkles,
} from "lucide-react";
import type { ContentBlock } from "@/components/course-builder/BlockEditor";

export type LessonType = "text" | "video" | "image" | "test" | "audio" | "lesson" | "slider" | "practice" | "feedback" | "homework" | "ai_avatar";

export interface TestQuestionLocal {
  id: string;
  question: string;
  options: { text: string }[];
  correct_answer: number;
  order_index: number;
  explanation?: string;
  image_url?: string | null;
  isNew?: boolean;
  isDeleted?: boolean;
}

export interface LessonAttachmentLocal {
  id: string;
  lesson_id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  order_index: number;
  created_at?: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

export interface Lesson {
  id: string;
  type: LessonType;
  title: string;
  content: string;
  expanded: boolean;
  blocks?: ContentBlock[];
  thumbnailUrl?: string;
  videoScript?: string;
  testPassingScore?: number;
  testQuestionsToShow?: number | null;
  questions?: TestQuestionLocal[];
  attachments?: LessonAttachmentLocal[];
  module_id?: string | null;
}

export interface CourseModule {
  id: string;
  course_id?: string;
  title: string;
  order_index: number;
  collapsed?: boolean;
}

export interface GeneratedQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

export const lessonIcons: Record<LessonType, LucideIcon> = {
  text: FileText,
  video: Video,
  image: Image,
  test: FileQuestion,
  audio: Headphones,
  lesson: FileText,
  slider: Presentation,
  practice: ClipboardList,
  feedback: MessageSquare,
  homework: BookCheck,
  ai_avatar: Sparkles,
};

export const lessonColors: Record<LessonType, string> = {
  text: "text-primary bg-primary/10",
  video: "text-sigma-purple bg-sigma-purple/10",
  image: "text-sigma-cyan bg-sigma-cyan/10",
  test: "text-sigma-orange bg-sigma-orange/10",
  audio: "text-green-500 bg-green-500/10",
  lesson: "text-primary bg-primary/10",
  slider: "text-amber-500 bg-amber-500/10",
  practice: "text-rose-500 bg-rose-500/10",
  feedback: "text-blue-500 bg-blue-500/10",
  homework: "text-indigo-500 bg-indigo-500/10",
  ai_avatar: "text-fuchsia-500 bg-gradient-to-br from-fuchsia-500/10 to-pink-500/10",
};
