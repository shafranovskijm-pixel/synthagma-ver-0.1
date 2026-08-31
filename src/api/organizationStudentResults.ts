import {
  fetchCourseStudentsPage,
  type CourseStudentPageRow,
  type FetchCourseStudentsPageInput,
} from "@/api/courseStudents";
import { supabase } from "@/integrations/supabase/client";

const EXPORT_PAGE_SIZE = 100;
const COURSE_PAGE_SIZE = 100;
const TEST_PAGE_SIZE = 100;

export interface OrganizationResultCourse {
  id: string;
  title: string;
}

export interface OrganizationCourseTest {
  id: string;
  title: string;
  passingScore: number;
  orderIndex: number;
}

export interface OrganizationStudentCourseResult extends CourseStudentPageRow {
  course_id: string;
  course_title: string;
  course_tests: OrganizationCourseTest[];
}

export interface StudentResultsProgress {
  completedCourses: number;
  totalCourses: number;
}

export interface FetchOrganizationStudentResultsInput {
  organizationId: string;
  signal?: AbortSignal;
  onProgress?: (progress: StudentResultsProgress) => void;
}

export interface FetchOrganizationStudentResultsDeps {
  loadCourses?: (
    organizationId: string,
    signal?: AbortSignal,
  ) => Promise<OrganizationResultCourse[]>;
  loadCourseTests?: (
    courseId: string,
    signal?: AbortSignal,
  ) => Promise<OrganizationCourseTest[]>;
  loadCoursePage?: (
    input: FetchCourseStudentsPageInput,
  ) => Promise<{
    rows: CourseStudentPageRow[];
    totalFiltered: number;
    nextOffset: number | null;
  }>;
}

function abortError(): Error {
  const error = new Error("Загрузка результатов отменена");
  error.name = "AbortError";
  return error;
}

async function loadOrganizationCourses(
  organizationId: string,
  signal?: AbortSignal,
): Promise<OrganizationResultCourse[]> {
  const courses: OrganizationResultCourse[] = [];
  const seenCourseIds = new Set<string>();
  let offset = 0;
  let expectedTotal: number | null = null;

  while (expectedTotal === null || courses.length < expectedTotal) {
    if (signal?.aborted) throw abortError();

    const request = supabase
      .from("courses")
      .select("id, title", { count: "exact" })
      .eq("organization_id", organizationId)
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + COURSE_PAGE_SIZE - 1);
    const { data, error, count } = await (signal ? request.abortSignal(signal) : request);

    if (signal?.aborted) throw abortError();
    if (error) throw error;
    if (count === null) throw new Error("Не удалось проверить полноту списка курсов");
    if (expectedTotal !== null && count !== expectedTotal) {
      throw new Error("Список курсов изменился во время формирования отчёта");
    }
    expectedTotal ??= count;

    const page = (data ?? []).map((course) => ({
      id: course.id,
      title: course.title || "Без названия",
    }));
    for (const course of page) {
      if (seenCourseIds.has(course.id)) {
        throw new Error("Получены повторяющиеся курсы при формировании отчёта");
      }
      seenCourseIds.add(course.id);
    }
    courses.push(...page);

    if (courses.length > expectedTotal) throw new Error("Получен неполный список курсов");
    if (courses.length === expectedTotal) break;
    if (page.length === 0) throw new Error("Не удалось загрузить полный список курсов");
    offset += page.length;
  }

  if (courses.length !== expectedTotal) throw new Error("Не удалось загрузить полный список курсов");

  return courses;
}

async function loadCourseTests(
  courseId: string,
  signal?: AbortSignal,
): Promise<OrganizationCourseTest[]> {
  const tests: OrganizationCourseTest[] = [];
  const seenTestIds = new Set<string>();
  let offset = 0;
  let expectedTotal: number | null = null;

  while (expectedTotal === null || tests.length < expectedTotal) {
    if (signal?.aborted) throw abortError();

    const request = supabase
      .from("lessons")
      .select("id, title, test_passing_score, order_index", { count: "exact" })
      .eq("course_id", courseId)
      .eq("type", "test")
      .order("order_index", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + TEST_PAGE_SIZE - 1);
    const { data, error, count } = await (signal ? request.abortSignal(signal) : request);

    if (signal?.aborted) throw abortError();
    if (error) throw error;
    if (count === null) throw new Error("Не удалось проверить полноту списка тестов");
    if (expectedTotal !== null && count !== expectedTotal) {
      throw new Error("Список тестов изменился во время формирования отчёта");
    }
    expectedTotal ??= count;

    const page = (data ?? []).map((test) => {
      const passingScore = Number(test.test_passing_score ?? 70);
      if (!Number.isFinite(passingScore)) {
        throw new Error("В настройках теста указан некорректный проходной балл");
      }
      return {
        id: test.id,
        title: test.title || "Тест",
        passingScore,
        orderIndex: Number(test.order_index ?? 0),
      };
    });
    for (const test of page) {
      if (seenTestIds.has(test.id)) {
        throw new Error("Получены повторяющиеся тесты при формировании отчёта");
      }
      seenTestIds.add(test.id);
    }
    tests.push(...page);

    if (tests.length > expectedTotal) throw new Error("Получен неполный список тестов курса");
    if (tests.length === expectedTotal) break;
    if (page.length === 0) throw new Error("Не удалось загрузить полный список тестов курса");
    offset += page.length;
  }

  if (tests.length !== expectedTotal) throw new Error("Не удалось загрузить полный список тестов курса");

  return tests;
}

function courseTestSignature(tests: OrganizationCourseTest[]): string {
  return JSON.stringify(tests.map((test) => [
    test.id,
    test.title,
    test.passingScore,
    test.orderIndex,
  ]));
}

/**
 * Loads the complete, tenant-scoped student test report for an organization.
 *
 * The existing course RPC enforces `students.read` and returns at most 100
 * enrollments. Courses and pages are deliberately loaded sequentially so a
 * large export cannot recreate the historical "too many connections" issue.
 * Any failed page rejects the whole operation; callers must never publish a
 * partial workbook as a complete report.
 */
export async function fetchOrganizationStudentResults(
  input: FetchOrganizationStudentResultsInput,
  deps: FetchOrganizationStudentResultsDeps = {},
): Promise<OrganizationStudentCourseResult[]> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new Error("Не указана организация для отчёта");
  }

  const loadCourses = deps.loadCourses ?? loadOrganizationCourses;
  const loadTests = deps.loadCourseTests ?? loadCourseTests;
  const loadCoursePage = deps.loadCoursePage ?? fetchCourseStudentsPage;
  const rawCourses = await loadCourses(organizationId, input.signal);
  if (input.signal?.aborted) throw abortError();
  const uniqueCourseIds = new Set<string>();
  for (const course of rawCourses) {
    if (!course.id || uniqueCourseIds.has(course.id)) {
      throw new Error("Получен некорректный список курсов организации");
    }
    uniqueCourseIds.add(course.id);
  }
  const courses = rawCourses;

  const result: OrganizationStudentCourseResult[] = [];
  input.onProgress?.({ completedCourses: 0, totalCourses: courses.length });

  for (let courseIndex = 0; courseIndex < courses.length; courseIndex += 1) {
    if (input.signal?.aborted) throw abortError();

    const course = courses[courseIndex];
    const courseTests = await loadTests(course.id, input.signal);
    if (input.signal?.aborted) throw abortError();
    const courseTestIds = new Set(courseTests.map((test) => test.id));
    let offset = 0;
    const seenOffsets = new Set<number>();
    const seenEnrollmentIds = new Set<string>();
    let expectedEnrollmentTotal: number | null = null;

    while (true) {
      if (input.signal?.aborted) throw abortError();
      if (seenOffsets.has(offset)) {
        throw new Error(`Некорректная пагинация результатов курса «${course.title}»`);
      }
      seenOffsets.add(offset);

      const page = await loadCoursePage({
        courseId: course.id,
        limit: EXPORT_PAGE_SIZE,
        offset,
        signal: input.signal,
      });
      if (input.signal?.aborted) throw abortError();
      if (expectedEnrollmentTotal !== null && page.totalFiltered !== expectedEnrollmentTotal) {
        throw new Error(`Список учеников курса «${course.title}» изменился во время формирования отчёта`);
      }
      expectedEnrollmentTotal ??= page.totalFiltered;

      const inconsistentRow = page.rows.find((row) => row.tests_total !== courseTests.length);
      if (inconsistentRow) {
        throw new Error(`Не удалось получить полный список тестов курса «${course.title}»`);
      }
      const unknownAttempt = page.rows.some((row) => (
        row.test_details.some((detail) => !courseTestIds.has(detail.lesson_id))
      ));
      if (unknownAttempt) {
        throw new Error(`Список тестов курса «${course.title}» изменился во время формирования отчёта`);
      }
      for (const row of page.rows) {
        if (!row.enrollment_id || seenEnrollmentIds.has(row.enrollment_id)) {
          throw new Error(`Получены повторяющиеся зачисления курса «${course.title}»`);
        }
        seenEnrollmentIds.add(row.enrollment_id);
      }

      result.push(
        ...page.rows.map((row) => ({
          ...row,
          course_id: course.id,
          course_title: course.title,
          course_tests: courseTests,
        })),
      );

      if (page.nextOffset === null) break;
      if (page.nextOffset <= offset) {
        throw new Error(`Некорректная следующая страница курса «${course.title}»`);
      }
      offset = page.nextOffset;
    }

    if (seenEnrollmentIds.size !== expectedEnrollmentTotal) {
      throw new Error(`Не удалось загрузить полный список учеников курса «${course.title}»`);
    }

    const finalCourseTests = await loadTests(course.id, input.signal);
    if (input.signal?.aborted) throw abortError();
    if (courseTestSignature(finalCourseTests) !== courseTestSignature(courseTests)) {
      throw new Error(`Список тестов курса «${course.title}» изменился во время формирования отчёта`);
    }

    input.onProgress?.({
      completedCourses: courseIndex + 1,
      totalCourses: courses.length,
    });
  }

  return result;
}
