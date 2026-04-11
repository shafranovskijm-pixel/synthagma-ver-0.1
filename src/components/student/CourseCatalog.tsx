import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CourseCardNew } from "./CourseCardNew";
import { cn } from "@/lib/utils";

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

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg font-medium">Курсы не найдены</p>
          <p className="text-sm">Попробуйте изменить параметры поиска</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map(course => (
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
              onClick={() => onCourseClick(course.id, !!course.is_enrolled)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
