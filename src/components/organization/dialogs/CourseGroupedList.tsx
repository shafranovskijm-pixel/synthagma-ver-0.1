import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { ReactNode, useMemo } from "react";

interface CourseCategory {
  id: string;
  name: string;
  color: string;
}

interface CourseWithCategory {
  id: string;
  category_id?: string | null;
  [key: string]: any;
}

interface CourseGroup {
  category: CourseCategory | null;
  courses: CourseWithCategory[];
}

export function groupCoursesByCategory<T extends CourseWithCategory>(
  courses: T[],
  getCategoryById: (id?: string | null) => CourseCategory | undefined
): { category: CourseCategory | null; courses: T[] }[] {
  const grouped = new Map<string, T[]>();
  const uncategorized: T[] = [];

  for (const course of courses) {
    if (course.category_id) {
      const arr = grouped.get(course.category_id) || [];
      arr.push(course);
      grouped.set(course.category_id, arr);
    } else {
      uncategorized.push(course);
    }
  }

  const result: { category: CourseCategory | null; courses: T[] }[] = [];

  for (const [categoryId, categoryCourses] of grouped) {
    const category = getCategoryById(categoryId);
    if (category) {
      result.push({ category, courses: categoryCourses });
    } else {
      uncategorized.push(...categoryCourses);
    }
  }

  // Sort categories alphabetically
  result.sort((a, b) => (a.category?.name || "").localeCompare(b.category?.name || ""));

  if (uncategorized.length > 0) {
    result.push({ category: null, courses: uncategorized });
  }

  return result;
}

interface CourseGroupedListProps<T extends CourseWithCategory> {
  courses: T[];
  getCategoryById: (id?: string | null) => CourseCategory | undefined;
  renderCourse: (course: T) => ReactNode;
  emptyMessage?: string;
}

export function CourseGroupedList<T extends CourseWithCategory>({
  courses,
  getCategoryById,
  renderCourse,
  emptyMessage = "Курсы не найдены",
}: CourseGroupedListProps<T>) {
  const groups = useMemo(
    () => groupCoursesByCategory(courses, getCategoryById),
    [courses, getCategoryById]
  );

  if (courses.length === 0) {
    return (
      <p className="text-muted-foreground text-sm text-center py-6">{emptyMessage}</p>
    );
  }

  // If only one group, render flat
  if (groups.length === 1) {
    return <>{groups[0].courses.map(renderCourse)}</>;
  }

  return (
    <>
      {groups.map((group) => (
        <Collapsible key={group.category?.id || "__none"} defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-2 hover:bg-secondary/30 rounded-lg transition-colors text-sm font-medium group">
            <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
            {group.category ? (
              <span
                className="px-2 py-0.5 rounded-full text-xs"
                style={{
                  backgroundColor: (group.category.color || '#888') + '20',
                  color: group.category.color || '#888',
                }}
              >
                {group.category.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Без категории</span>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {group.courses.length}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pl-2">
            {group.courses.map(renderCourse)}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </>
  );
}
