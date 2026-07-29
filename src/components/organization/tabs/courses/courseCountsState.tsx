import { createContext, useContext } from "react";

export type CourseCountsState = "loading" | "error" | "ready";

/**
 * Phase 4B.1.c.2.a — lets deeply-nested course cards render skeletons /
 * em-dashes without threading `countsState` through every prop chain.
 * Default is "ready" so existing consumers (course-store, catalog etc.)
 * that don't opt-in continue to render real numbers.
 */
export const CourseCountsStateContext = createContext<CourseCountsState>("ready");

export function useCourseCountsState(): CourseCountsState {
  return useContext(CourseCountsStateContext);
}

interface CountValueProps {
  value: number | undefined | null;
  /** Optional suffix such as " учеников" — hidden while loading/erroring. */
  suffix?: string;
  /** Tailwind width class for the skeleton placeholder. */
  skeletonWidth?: string;
}

/**
 * Renders a numeric count using the ambient CourseCountsState:
 *   • loading → skeleton
 *   • error   → em-dash
 *   • ready   → number (0 is a real value, shown as-is)
 */
export function CountValue({ value, suffix, skeletonWidth = "w-6" }: CountValueProps) {
  const state = useCourseCountsState();
  if (state === "loading") {
    return <span className={`inline-block h-3 ${skeletonWidth} rounded bg-muted animate-pulse align-middle`} />;
  }
  if (state === "error") {
    return <span>—{suffix ?? ""}</span>;
  }
  return (
    <>
      {value ?? 0}
      {suffix ?? ""}
    </>
  );
}
