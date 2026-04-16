import { BookOpen, Clock, CheckCircle2 } from "lucide-react";
import { CourseCardNew } from "./CourseCardNew";
import { HeroBannerSwiper } from "@/components/shared/HeroBannerSwiper";
import type { StudentCourse } from "@/hooks/useStudentDashboard";

interface StudentLibraryProps {
  courses: StudentCourse[];
  totalProgress: number;
  totalTimeSpent: number;
  totalCompletedLessons: number;
  formatTime: (m: number) => string;
  isVideoIdentified: boolean;
  onCourseClick: (courseId: string) => void;
  branding?: { primaryColor: string; secondaryColor: string } | null;
}

export function StudentLibrary({
  courses, totalProgress, totalTimeSpent, totalCompletedLessons,
  formatTime, isVideoIdentified, onCourseClick, branding,
}: StudentLibraryProps) {
  return (
    <div className="space-y-6">
      {/* Progress summary card */}
      <HeroBannerSwiper className="!h-auto !min-h-[140px]">
        <div className="relative z-10 p-6 flex items-center justify-between text-white">
          <div>
            <h2 className="font-bold text-lg mb-1">Общий прогресс</h2>
            <p className="text-white/80 text-sm mb-3">{courses.length} {courses.length === 1 ? "курс" : courses.length < 5 ? "курса" : "курсов"}</p>
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{formatTime(totalTimeSpent)}</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" />{totalCompletedLessons} уроков</span>
            </div>
          </div>
          <div className="relative w-24 h-24 shrink-0">
            <svg className="w-24 h-24 -rotate-90">
              <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
              <circle cx="48" cy="48" r="40" fill="none" stroke="white" strokeWidth="8" strokeDasharray={`${totalProgress * 2.51} 251`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xl font-bold">{totalProgress}%</div>
          </div>
        </div>
      </HeroBannerSwiper>

      {/* Course grid */}
      {courses.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-primary/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-1">Пока нет курсов</h3>
          <p className="text-sm text-muted-foreground">Перейдите в каталог, чтобы записаться на курс</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {courses.map(course => (
            <CourseCardNew
              key={course.id}
              id={course.id}
              title={course.title}
              description={course.description}
              duration={course.duration}
              progress={course.progress}
              totalLessons={course.totalLessons}
              completedLessons={course.completedLessons}
              status={course.status === "completed" ? "completed" : "in_progress"}
              needsVideoId={course.skip_video_identification === false && !isVideoIdentified}
              onClick={() => onCourseClick(course.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
