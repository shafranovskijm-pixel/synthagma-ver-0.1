export interface CourseModuleOrder {
  id: string;
  order_index: number;
}

interface OrderedLesson {
  module_id?: string | null;
  order_index: number;
}

// Cached modular courses written before this version only had a flat order.
export const COURSE_LESSON_ORDER_VERSION = 1;

/** Match the builder's module groups without changing lesson IDs or stored indexes.
 * Legacy/unassigned lessons follow known modules in their original flat order.
 * Equal indexes retain input order, including the order of tied module groups.
 */
export function orderCourseLessons<T extends OrderedLesson>(
  lessons: readonly T[],
  modules: readonly CourseModuleOrder[],
): T[] {
  const moduleRank = new Map(
    modules.map((module, index) => ({ module, index }))
      .sort((a, b) => a.module.order_index - b.module.order_index || a.index - b.index)
      .map(({ module }, rank) => [module.id, rank] as const),
  );
  return lessons.map((lesson, index) => ({ lesson, index }))
    .sort((a, b) => {
      const aModule = moduleRank.get(a.lesson.module_id ?? '') ?? moduleRank.size;
      const bModule = moduleRank.get(b.lesson.module_id ?? '') ?? moduleRank.size;
      return aModule - bModule || a.lesson.order_index - b.lesson.order_index || a.index - b.index;
    })
    .map(({ lesson }) => lesson);
}
