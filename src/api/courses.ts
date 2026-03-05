import { supabase } from "@/integrations/supabase/client";
import type { Course, CourseCategory, Enrollment } from "@/types";

// ============= Courses API =============

export async function fetchCourses(organizationId: string): Promise<Course[]> {
  const { data: coursesData, error } = await supabase
    .from("courses")
    .select(`*, lessons(count)`)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching courses:", error);
    return [];
  }

  // Get enrollments for all courses
  const courseIds = (coursesData || []).map(c => c.id);
  
  let enrollments: Enrollment[] = [];
  if (courseIds.length > 0) {
    const { data } = await supabase
      .from("enrollments")
      .select("*")
      .in("course_id", courseIds);
    enrollments = (data || []) as Enrollment[];
  }

  // Exclude organization/admin accounts from student counters
  const enrollmentUserIds = Array.from(new Set(enrollments.map(e => e.user_id)));
  let orgAdminUserIds = new Set<string>();
  if (enrollmentUserIds.length > 0) {
    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", enrollmentUserIds)
      .in("role", ["organization", "admin"]);
    orgAdminUserIds = new Set((rolesData || []).map(r => r.user_id));
  }

  // Build courses with stats
  return (coursesData || []).map((course: any) => {
    const courseEnrollments = enrollments
      .filter(e => e.course_id === course.id)
      .filter(e => !orgAdminUserIds.has(e.user_id));
    const uniqueStudentIds = new Set(courseEnrollments.map(e => e.user_id));
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      is_published: course.is_published,
      created_at: course.created_at,
      updated_at: course.updated_at,
      organization_id: course.organization_id,
      category_id: course.category_id,
      duration: course.duration,
      lessonsCount: course.lessons?.[0]?.count || 0,
      studentsCount: uniqueStudentIds.size,
      // Course settings (must be present so UI toggles don't reset on refresh)
      skip_video_identification: course.skip_video_identification ?? false,
      sequential_lessons: course.sequential_lessons ?? false,
      // DB default is true; treat NULL/undefined as true
      allow_video_seek: course.allow_video_seek ?? true,
      training_form: course.training_form ?? "Очная",
      notify_on_completion: course.notify_on_completion ?? false,
      completion_notify_emails: course.completion_notify_emails ?? null,
    };
  });
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
      is_published: false
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
    const newLessons = lessons.map(lesson => ({
      course_id: newCourse.id,
      title: lesson.title,
      type: lesson.type,
      content: lesson.content,
      order_index: lesson.order_index,
      test_questions_count: lesson.test_questions_count
    }));

    await supabase.from("lessons").insert(newLessons);
  }

  return newCourse as Course;
}

// ============= Categories API =============

export async function fetchCategories(organizationId: string): Promise<CourseCategory[]> {
  const { data, error } = await supabase
    .from("course_categories")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }

  return data as CourseCategory[];
}

export async function createCategory(
  organizationId: string,
  name: string,
  color: string
): Promise<CourseCategory | null> {
  const { data, error } = await supabase
    .from("course_categories")
    .insert({
      organization_id: organizationId,
      name,
      color
    })
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

export async function fetchCourseStudents(courseId: string, courseTitle: string): Promise<any[]> {
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, user_id, progress, status")
    .eq("course_id", courseId);

  const students = [];
  
  for (const enrollment of enrollments || []) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, email, login")
      .eq("user_id", enrollment.user_id)
      .single();

    if (profile) {
      // Fetch decrypted password via secure RPC
      const { data: decryptedPw } = await supabase
        .rpc("get_decrypted_student_password", { p_user_id: profile.user_id });

      students.push({
        id: profile.id,
        user_id: profile.user_id,
        enrollment_id: enrollment.id,
        name: profile.full_name || "Без имени",
        email: profile.email || "",
        login: profile.login || null,
        generated_password: decryptedPw || null,
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
