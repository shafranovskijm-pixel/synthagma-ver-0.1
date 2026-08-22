export const SYSTEM_WELCOME_COURSE_KEY = "welcome";

type CourseSystemKeyLike = {
  system_key?: string | null;
};

/**
 * The registration flow seeds one published demo course for every new school.
 * It is useful as help content, but it must never count as the school's own
 * first course in onboarding or first-run navigation.
 */
export function isSystemWelcomeCourse(course: CourseSystemKeyLike): boolean {
  return course.system_key === SYSTEM_WELCOME_COURSE_KEY;
}

export function hasOrganizationCourse(courses: CourseSystemKeyLike[] | null | undefined): boolean {
  return (courses ?? []).some((course) => !isSystemWelcomeCourse(course));
}
