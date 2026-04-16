import { useState, useMemo } from "react";
import { Search, Clock, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CourseCardNew } from "./CourseCardNew";
import { HeroBannerSwiper } from "@/components/shared/HeroBannerSwiper";

interface CatalogCourse {
  id: string;
  title: string;
  description: string | null;
  cover_image_url?: string | null;
  duration?: string | null;
  price?: number;
  category_id?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  total_lessons?: number;
  is_enrolled?: boolean;
  progress?: number;
  completed_lessons?: number;
  status?: "in_progress" | "completed" | "not_enrolled" | "pending";
  external_card_url?: string | null;
  require_enrollment_approval?: boolean;
}

interface CourseCatalogProps {
  courses: CatalogCourse[];
  categories: { id: string; name: string; color: string | null }[];
  onCourseClick: (courseId: string, isEnrolled: boolean) => void;
  /** Enrolled courses to show at the top */
  enrolledCourses?: {
    id: string;
    title: string;
    description: string | null;
    duration: string | null;
    progress: number;
    totalLessons: number;
    completedLessons: number;
    status: "in_progress" | "completed" | "locked";
    skip_video_identification?: boolean;
  }[];
  isVideoIdentified?: boolean;
  /** Progress stats for the banner */
  totalProgress?: number;
  totalTimeSpent?: number;
  totalCompletedLessons?: number;
  formatTime?: (m: number) => string;
  /** Callbacks for paid courses */
  onBuy?: (courseId: string) => void;
  onEnroll?: (courseId: string) => void;
}

export function CourseCatalog({
  courses, categories, onCourseClick,
  enrolledCourses, isVideoIdentified,
  totalProgress = 0, totalTimeSpent = 0, totalCompletedLessons = 0,
  formatTime = (m) => `${Math.floor(m / 60)}ч ${m % 60}м`,
  onBuy, onEnroll,
}: CourseCatalogProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Filter only non-enrolled courses for the "available" section
  const availableCourses = useMemo(() => {
    return courses.filter(c => !c.is_enrolled);
  }, [courses]);

  const filtered = useMemo(() => {
    return availableCourses.filter(c => {
      if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedCategory && c.category_id !== selectedCategory) return false;
      return true;
    });
  }, [availableCourses, search, selectedCategory]);

  // Group filtered courses by category
  const grouped = useMemo(() => {
    const groups: { name: string; color: string | null; courses: CatalogCourse[] }[] = [];
    const catMap = new Map<string, { name: string; color: string | null; courses: CatalogCourse[] }>();

    for (const course of filtered) {
      const catName = course.category_name || "Другое";
      const catColor = course.category_color || null;
      const key = course.category_id || "__other__";

      if (!catMap.has(key)) {
        const group = { name: catName, color: catColor, courses: [] as CatalogCourse[] };
        catMap.set(key, group);
        groups.push(group);
      }
      catMap.get(key)!.courses.push(course);
    }

    return groups;
  }, [filtered]);

  const hasEnrolled = enrolledCourses && enrolledCourses.length > 0;

  return (
    <div className="space-y-6">
      {/* Enrolled courses section */}
      {hasEnrolled && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full shrink-0 bg-primary" />
            <h3 className="text-lg font-semibold text-foreground">Мои курсы</h3>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{enrolledCourses!.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {enrolledCourses!.map(course => (
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
                onClick={() => onCourseClick(course.id, true)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Progress banner */}
      {hasEnrolled && (
        <HeroBannerSwiper className="!h-auto !min-h-[120px] md:!min-h-[140px]">
          <div className="relative z-10 p-4 md:p-6 flex items-center justify-between text-white">
            <div>
              <h2 className="font-bold text-base md:text-lg mb-1">Общий прогресс</h2>
              <p className="text-white/80 text-xs md:text-sm mb-2 md:mb-3">
                {enrolledCourses!.length} {enrolledCourses!.length === 1 ? "курс" : enrolledCourses!.length < 5 ? "курса" : "курсов"}
              </p>
              <div className="flex gap-3 md:gap-4 text-xs md:text-sm">
                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 md:w-4 md:h-4" />{formatTime(totalTimeSpent)}</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" />{totalCompletedLessons} уроков</span>
              </div>
            </div>
            <div className="relative w-16 h-16 md:w-24 md:h-24 shrink-0">
              <svg className="w-16 h-16 md:w-24 md:h-24 -rotate-90">
                <circle cx="50%" cy="50%" r="35%" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
                <circle cx="50%" cy="50%" r="35%" fill="none" stroke="white" strokeWidth="8"
                  strokeDasharray={`${totalProgress * 2.51} 251`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-base md:text-xl font-bold">{totalProgress}%</div>
            </div>
          </div>
        </HeroBannerSwiper>
      )}

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск курсов..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={selectedCategory === null ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setSelectedCategory(null)}
          >
            Все
          </Badge>
          {categories.map(cat => (
            <Badge
              key={cat.id}
              variant={selectedCategory === cat.id ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              style={selectedCategory === cat.id && cat.color ? { backgroundColor: cat.color, borderColor: cat.color } : undefined}
            >
              {cat.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Grouped grid — available courses */}
      {filtered.length === 0 && !hasEnrolled ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Курсы не найдены</p>
          <p className="text-sm">Попробуйте изменить параметры поиска</p>
        </div>
      ) : filtered.length === 0 && hasEnrolled ? null : (
        <div className="space-y-8">
          {grouped.map((group, idx) => (
            <div key={group.name + idx}>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: group.color || "hsl(var(--muted-foreground))" }}
                />
                <h3 className="text-lg font-semibold text-foreground">{group.name}</h3>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">{group.courses.length}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {group.courses.map(course => {
                  const isPaid = course.price != null && course.price > 0;
                  return (
                    <CourseCardNew
                      key={course.id}
                      id={course.id}
                      title={course.title}
                      description={course.description}
                      coverImageUrl={course.cover_image_url}
                      categoryName={course.category_name}
                      categoryColor={course.category_color}
                      duration={course.duration}
                      price={course.price}
                      progress={course.progress}
                      totalLessons={course.total_lessons}
                      completedLessons={course.completed_lessons}
                      status={course.status || "not_enrolled"}
                      onClick={() => {
                        if (course.external_card_url && !course.is_enrolled) {
                          window.open(course.external_card_url, "_blank");
                        } else {
                          onCourseClick(course.id, !!course.is_enrolled);
                        }
                      }}
                      onBuy={isPaid && onBuy ? () => onBuy(course.id) : undefined}
                      onEnroll={isPaid && onEnroll ? () => onEnroll(course.id) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
