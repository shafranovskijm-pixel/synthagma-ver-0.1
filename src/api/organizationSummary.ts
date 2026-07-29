/**
 * Phase 4B.1.a — API layer for aggregated organization dashboard data.
 * Wraps the SECURITY DEFINER RPCs `get_organization_dashboard_summary`
 * and `get_organization_course_overview`.
 *
 * Not yet wired into UI — that is 4B.1.b.
 */

import { supabase } from "@/integrations/supabase/client";

export interface OrganizationDashboardSummary {
  activeStudentsCount: number;
  totalCoursesCount: number;
  completedStudentsCount: number;
  averageProgress: number;
  documentsTotal: number;
  withPassport: number;
  withSnils: number;
  withEducation: number;
  documentsComplete: number;
}

export interface OrganizationCourseOverviewRow {
  courseId: string;
  studentsCount: number;
  lessonsCount: number;
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchOrganizationDashboardSummary(
  organizationId: string,
): Promise<OrganizationDashboardSummary> {
  const { data, error } = await supabase.rpc("get_organization_dashboard_summary", {
    p_organization_id: organizationId,
  });
  if (error) throw error;

  // The RPC returns TABLE(...) — Supabase client surfaces this as an array.
  const row = Array.isArray(data) ? data[0] : (data as Record<string, unknown> | null);
  if (!row) {
    throw new Error("Пустой ответ get_organization_dashboard_summary");
  }
  const r = row as Record<string, unknown>;
  return {
    activeStudentsCount: toNumber(r.active_students_count),
    totalCoursesCount: toNumber(r.total_courses_count),
    completedStudentsCount: toNumber(r.completed_students_count),
    averageProgress: toNumber(r.average_progress),
    documentsTotal: toNumber(r.documents_total),
    withPassport: toNumber(r.with_passport),
    withSnils: toNumber(r.with_snils),
    withEducation: toNumber(r.with_education),
    documentsComplete: toNumber(r.documents_complete),
  };
}

export async function fetchOrganizationCourseOverview(
  organizationId: string,
): Promise<OrganizationCourseOverviewRow[]> {
  const { data, error } = await supabase.rpc("get_organization_course_overview", {
    p_organization_id: organizationId,
  });
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows.map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      courseId: String(r.course_id ?? ""),
      studentsCount: toNumber(r.students_count),
      lessonsCount: toNumber(r.lessons_count),
    };
  });
}
