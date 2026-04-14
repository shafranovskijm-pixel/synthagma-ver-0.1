import { supabase } from "@/integrations/supabase/client";
import type { Course, CourseCategory, Enrollment } from "@/types";

// ============= Courses API =============

export async function fetchCourses(organizationId: string): Promise<Course[]> {
  const { data: coursesData, error } = await supabase
    .from("courses")
    .select("id, title, description, is_published, created_at, updated_at, organization_id, category_id, duration, skip_video_identification, sequential_lessons, allow_video_seek, training_form, notify_on_completion, completion_notify_emails, cover_image_url, catalog_order, price")
    .eq("organization_id", organizationId)
    .order("catalog_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching courses:", error);
    throw error;
  }

  if (!coursesData || coursesData.length === 0) return [];

  return coursesData.map((course: any) => ({
    id: course.id,
    title: course.title,
    description: course.description,
    is_published: course.is_published,
    created_at: course.created_at,
    updated_at: course.updated_at,
    organization_id: course.organization_id,
    category_id: course.category_id,
    duration: course.duration,
    lessonsCount: 0,
    studentsCount: 0,
    skip_video_identification: course.skip_video_identification ?? false,
    sequential_lessons: course.sequential_lessons ?? false,
    allow_video_seek: course.allow_video_seek ?? true,
    training_form: course.training_form ?? "Очная",
    notify_on_completion: course.notify_on_completion ?? false,
    completion_notify_emails: course.completion_notify_emails ?? null,
    cover_image_url: course.cover_image_url ?? null,
    catalog_order: course.catalog_order ?? 0,
    price: course.price ?? 0,
  }));
}

/** Fetch lesson counts for courses separately (non-blocking). */
export async function fetchCourseLessonCounts(courseIds: string[]): Promise<Map<string, number>> {
  const countMap = new Map<string, number>();
  if (courseIds.length === 0) return countMap;

  try {
    const { data } = await supabase
      .from("lessons")
      .select("course_id")
      .in("course_id", courseIds);

    if (!data || data.length === 0) return countMap;

    for (const row of data) {
      countMap.set(row.course_id, (countMap.get(row.course_id) || 0) + 1);
    }
  } catch (e) {
    console.warn("Failed to load lesson counts (non-fatal):", e);
  }

  return countMap;
}

/** Fetch student counts for courses separately (non-blocking). */
export async function fetchCourseStudentCounts(courseIds: string[]): Promise<Map<string, number>> {
  const studentCountMap = new Map<string, number>();
  if (courseIds.length === 0) return studentCountMap;

  try {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id, user_id")
      .in("course_id", courseIds);

    if (!enrollments || enrollments.length === 0) return studentCountMap;

    const enrollmentUserIds = Array.from(new Set(enrollments.map(e => e.user_id)));
    let orgAdminUserIds = new Set<string>();
    try {
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", enrollmentUserIds)
        .in("role", ["organization", "admin"]);
      orgAdminUserIds = new Set((rolesData || []).map(r => r.user_id));
    } catch (e) {
      console.warn("Failed to fetch user roles for student count filtering:", e);
    }

    for (const courseId of courseIds) {
      const uniqueStudents = new Set(
        enrollments
          .filter(e => e.course_id === courseId && !orgAdminUserIds.has(e.user_id))
          .map(e => e.user_id)
      );
      studentCountMap.set(courseId, uniqueStudents.size);
    }
  } catch (e) {
    console.warn("Failed to load student counts (non-fatal):", e);
  }

  return studentCountMap;
}

export async function fetchCourse(courseId: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from("courses")
    .select(`*, lessons(count)`)
    .eq("id", courseId)
    .single();

  if (error) {
    console.error("Error fetching course:", error);
    return null;
  }

  return {
    ...data,
    lessonsCount: data.lessons?.[0]?.count || 0
  } as Course;
}

export async function createCourse(
  organizationId: string,
  title: string,
  description?: string,
  categoryId?: string
): Promise<Course | null> {
  const { data, error } = await supabase
    .from("courses")
    .insert({
      organization_id: organizationId,
      title,
      description: description || null,
      category_id: categoryId || null,
      is_published: false
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating course:", JSON.stringify(error));
    return null;
  }

  return data as Course;
}

export async function updateCourse(courseId: string, updates: Partial<Course>): Promise<boolean> {
  const { error } = await supabase
    .from("courses")
    .update(updates)
    .eq("id", courseId);

  if (error) {
    console.error("Error updating course:", error);
    return false;
  }

  return true;
}

export async function deleteCourse(courseId: string): Promise<boolean> {
  // Delete lessons first
  await supabase
    .from("lessons")
    .delete()
    .eq("course_id", courseId);

  // Delete enrollments
  await supabase
    .from("enrollments")
    .delete()
    .eq("course_id", courseId);

  // Delete course
  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId);

  return !error;
}

export async function publishCourse(courseId: string, isPublished: boolean): Promise<boolean> {
  const { error } = await supabase
    .from("courses")
    .update({ is_published: isPublished })
    .eq("id", courseId);

  return !error;
}

export async function duplicateCourse(courseId: string): Promise<Course | null> {
  // Get original course
  const { data: original } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();

  if (!original) return null;

  // Create new course
  const { data: newCourse, error } = await supabase
    .from("courses")
    .insert({
      organization_id: original.organization_id,
      title: `${original.title} (копия)`,
      description: original.description,
      category_id: original.category_id,
      duration: original.duration,
      is_published: false,
      sequential_lessons: original.sequential_lessons,
      allow_video_seek: original.allow_video_seek,
      skip_video_identification: original.skip_video_identification,
      training_form: original.training_form,
      notify_on_completion: original.notify_on_completion,
      completion_notify_emails: original.completion_notify_emails,
      default_access_days: original.default_access_days,
    })
    .select()
    .single();

  if (error || !newCourse) return null;

  // Copy lessons
  const { data: lessons } = await supabase
    .from("lessons")
    .select("*")
    .eq("course_id", courseId)
    .order("order_index");

  if (lessons && lessons.length > 0) {
    // Insert lessons one by one to get ID mapping
    const lessonMapping: Record<string, string> = {};

    for (const lesson of lessons) {
      const { data: newLesson } = await supabase
        .from("lessons")
        .insert({
          course_id: newCourse.id,
          title: lesson.title,
          type: lesson.type,
          content: lesson.content,
          order_index: lesson.order_index,
          test_questions_count: lesson.test_questions_count,
          test_passing_score: lesson.test_passing_score,
          test_questions_to_show: lesson.test_questions_to_show,
          is_locked: lesson.is_locked ?? false,
        })
        .select("id")
        .single();

      if (newLesson) {
        lessonMapping[lesson.id] = newLesson.id;
      }
    }

    // Copy test questions for test-type lessons
    const testLessons = lessons.filter(l => l.type === "test");
    for (const lesson of testLessons) {
      const newLessonId = lessonMapping[lesson.id];
      if (!newLessonId) continue;

      const { data: questions } = await supabase
        .from("test_questions")
        .select("*")
        .eq("lesson_id", lesson.id);

      if (questions && questions.length > 0) {
        const newQuestions = questions.map(q => ({
          lesson_id: newLessonId,
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          order_index: q.order_index,
          explanation: q.explanation,
          image_url: q.image_url,
          is_bank_question: q.is_bank_question,
        }));

        await supabase.from("test_questions").insert(newQuestions);
      }
    }

    // Copy lesson attachments
    for (const lesson of lessons) {
      const newLessonId = lessonMapping[lesson.id];
      if (!newLessonId) continue;

      const { data: attachments } = await supabase
        .from("lesson_attachments")
        .select("*")
        .eq("lesson_id", lesson.id);

      if (attachments && attachments.length > 0) {
        const newAttachments = attachments.map(a => ({
          lesson_id: newLessonId,
          name: a.name,
          file_url: a.file_url,
          file_type: a.file_type,
          file_size: a.file_size,
          category: a.category,
          order_index: a.order_index,
        }));

        await supabase.from("lesson_attachments").insert(newAttachments);
      }
    }
  }

  return newCourse as Course;
}

// ============= Categories API =============

export async function fetchCategories(organizationId: string): Promise<CourseCategory[]> {
  const { data, error } = await supabase
    .from("course_categories")
    .select("*")
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }

  return ((data || []) as CourseCategory[]).sort((a, b) => {
    const orderA = a.order_index ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.order_index ?? Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.name.localeCompare(b.name, "ru");
  });
}

export async function createCategory(
  organizationId: string,
  name: string,
  color: string
): Promise<CourseCategory | null> {
  const { data, error } = await supabase
    .from("course_categories")
    .insert({ organization_id: organizationId, name, color })
    .select()
    .single();

  if (error) {
    console.error("Error creating category:", error);
    return null;
  }

  return data as CourseCategory;
}

export async function updateCategory(categoryId: string, updates: Partial<CourseCategory>): Promise<boolean> {
  const { error } = await supabase
    .from("course_categories")
    .update(updates)
    .eq("id", categoryId);

  return !error;
}

export async function deleteCategory(categoryId: string): Promise<boolean> {
  // Remove category from courses first
  await supabase
    .from("courses")
    .update({ category_id: null })
    .eq("category_id", categoryId);

  const { error } = await supabase
    .from("course_categories")
    .delete()
    .eq("id", categoryId);

  return !error;
}

// ============= Course Enrollments API =============

export async function fetchCourseEnrollments(courseId: string): Promise<Enrollment[]> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("*")
    .eq("course_id", courseId);

  if (error) {
    console.error("Error fetching enrollments:", error);
    return [];
  }

  return data as Enrollment[];
}

/**
 * Fetch students for a course using batch queries (no N+1).
 * Uses a single batch RPC call for passwords instead of per-student queries.
 */
export async function fetchCourseStudents(courseId: string, courseTitle: string): Promise<any[]> {
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, user_id, progress, status")
    .eq("course_id", courseId);

  if (!enrollments || enrollments.length === 0) return [];

  const userIds = Array.from(new Set(enrollments.map(e => e.user_id)));

  // Batch fetch profiles
  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, email, login, organization_id")
    .in("user_id", userIds);

  if (!profilesData || profilesData.length === 0) return [];

  // Get organization_id from first profile for batch password decryption
  const orgId = profilesData[0]?.organization_id;

  // Batch fetch passwords — single RPC call instead of N calls
  const passwordMap = new Map<string, string>();
  if (orgId) {
    const { data: passwordData } = await supabase
      .rpc("get_decrypted_student_passwords", { p_organization_id: orgId });
    if (passwordData) {
      for (const row of passwordData) {
        if (row.decrypted_password) {
          passwordMap.set(row.user_id, row.decrypted_password);
        }
      }
    }
  }

  // Build profile map
  const profileMap = new Map(profilesData.map(p => [p.user_id, p]));

  const students: any[] = [];
  for (const enrollment of enrollments) {
    const profile = profileMap.get(enrollment.user_id);
    if (profile) {
      students.push({
        id: profile.id,
        user_id: profile.user_id,
        enrollment_id: enrollment.id,
        name: profile.full_name || "Без имени",
        email: profile.email || "",
        login: profile.login || null,
        generated_password: passwordMap.get(profile.user_id) || null,
        course: courseTitle,
        course_id: courseId,
        progress: enrollment.progress,
        lastActivity: null,
        status: enrollment.status
      });
    }
  }

  return students;
}
