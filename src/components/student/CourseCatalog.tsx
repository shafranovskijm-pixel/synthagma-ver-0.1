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
  status?: "in_progress" | "completed" | "not_enrolled";
  external_card_url?: string | null;
}

interface CourseCatalogProps {
  courses: CatalogCourse[];
  categories: { id: string; name: string; color: string | null }[];
  onCourseClick: (courseId: string, isEnrolled: boolean) => void;
}

export function CourseCatalog({ courses, categories, onCourseClick }: CourseCatalogProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return courses.filter(c => {
      if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (selectedCategory && c.category_id !== selectedCategory) return false;
      return true;
    });
  }, [courses, search, selectedCategory]);

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

  return (
    <div className="space-y-6">
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

      {/* Grouped grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Курсы не найдены</p>
          <p className="text-sm">Попробуйте изменить параметры поиска</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group, idx) => (
            <div key={group.name + idx}>
              {/* Category header with colored dot and divider */}
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
                {group.courses.map(course => (
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
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
