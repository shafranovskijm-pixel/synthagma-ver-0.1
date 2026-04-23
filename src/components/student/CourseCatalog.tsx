import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CourseCardNew } from "./CourseCardNew";

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
  totalProgress?: number;
  totalTimeSpent?: number;
  totalCompletedLessons?: number;
  formatTime?: (m: number) => string;
  onBuy?: (courseId: string) => void;
  onEnroll?: (courseId: string) => void;
  /** When true, hide "needs video identification" badges — admin/manager preview. */
  isAdminView?: boolean;
}

export function CourseCatalog({
  courses, categories, onCourseClick,
  enrolledCourses, isVideoIdentified,
  totalProgress = 0, totalTimeSpent = 0, totalCompletedLessons = 0,
  formatTime = (m) => `${Math.floor(m / 60)}ч ${m % 60}м`,
  onBuy, onEnroll, isAdminView = false,
}: CourseCatalogProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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
      {/* Progress banner — on top */}



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
                needsVideoId={!isAdminView && course.skip_video_identification === false && !isVideoIdentified}
                onClick={() => onCourseClick(course.id, true)}
              />
            ))}
          </div>
        </div>
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
