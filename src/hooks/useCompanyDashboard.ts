import { useState, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { safeInvoke } from '@/utils/safeInvoke';
import { useAuth } from '@/hooks/useAuth';
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

interface CompanyData {
  id: string;
  name: string;
  inn: string | null;
  email: string | null;
  director: string | null;
  organization_id: string;
  user_id: string | null;
}

interface EmployeeWithProgress {
  user_id: string;
  full_name: string;
  email: string | null;
  login: string | null;
  enrollments: {
    course_id: string;
    course_title: string;
    progress: number;
    status: string;
    completed_at: string | null;
  }[];
  avg_progress: number;
}

interface CompanyStats {
  totalEmployees: number;
  avgProgress: number;
  completedCourses: number;
  activeCourses: number;
}

interface DashboardData {
  company: CompanyData | null;
  employees: EmployeeWithProgress[];
  stats: CompanyStats;
}

const EMPTY_STATS: CompanyStats = { totalEmployees: 0, avgProgress: 0, completedCourses: 0, activeCourses: 0 };
const EMPTY_DATA: DashboardData = { company: null, employees: [], stats: EMPTY_STATS };

const dashboardKey = (userId: string, isImpersonating: boolean) =>
  ['companyDashboard', userId, isImpersonating] as const;

async function fetchCompanyDashboard(targetUserId: string, isImpersonating: boolean): Promise<DashboardData> {
  // 1) Try as company owner
  let { data: companyData } = await supabase
    .from('companies')
    .select('id, name, inn, email, director, organization_id, user_id')
    .eq('user_id', targetUserId)
    .maybeSingle();

  // 2) Fallback: find via company_staff (only when not impersonating)
  if (!companyData && !isImpersonating) {
    const { data: staffRow } = await supabase
      .from('company_staff')
      .select('company_id')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (staffRow?.company_id) {
      const { data } = await supabase
        .from('companies')
        .select('id, name, inn, email, director, organization_id, user_id')
        .eq('id', staffRow.company_id)
        .maybeSingle();
      companyData = data;
    }
  }

  if (!companyData) return EMPTY_DATA;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, full_name, email, login')
    .eq('company_id', companyData.id);

  if (!profiles || profiles.length === 0) {
    return { company: companyData, employees: [], stats: EMPTY_STATS };
  }

  const userIds = profiles.map(p => p.user_id);

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('user_id, course_id, progress, status, completed_at, courses(title)')
    .in('user_id', userIds);

  // Build a map for O(1) per-user lookup instead of O(N*M) filter
  const enrollmentsByUser = new Map<string, EmployeeWithProgress['enrollments']>();
  (enrollments || []).forEach(e => {
    const list = enrollmentsByUser.get(e.user_id) || [];
    list.push({
      course_id: e.course_id,
      course_title: (e.courses as any)?.title || 'Курс',
      progress: e.progress || 0,
      status: e.status,
      completed_at: e.completed_at,
    });
    enrollmentsByUser.set(e.user_id, list);
  });

  const employeesWithProgress: EmployeeWithProgress[] = profiles.map(profile => {
    const userEnrollments = enrollmentsByUser.get(profile.user_id) || [];
    const avgProgress = userEnrollments.length > 0
      ? Math.round(userEnrollments.reduce((sum, e) => sum + e.progress, 0) / userEnrollments.length)
      : 0;
    return {
      user_id: profile.user_id,
      full_name: profile.full_name || '',
      email: profile.email,
      login: profile.login,
      enrollments: userEnrollments,
      avg_progress: avgProgress,
    };
  });

  const allEnrollments = employeesWithProgress.flatMap(e => e.enrollments);
  const completedCount = allEnrollments.filter(e => e.status === 'completed').length;
  const activeCount = allEnrollments.filter(e => e.status === 'active').length;
  const totalAvg = employeesWithProgress.length > 0
    ? Math.round(employeesWithProgress.reduce((sum, e) => sum + e.avg_progress, 0) / employeesWithProgress.length)
    : 0;

  return {
    company: companyData,
    employees: employeesWithProgress,
    stats: {
      totalEmployees: profiles.length,
      avgProgress: totalAvg,
      completedCourses: completedCount,
      activeCourses: activeCount,
    },
  };
}

export function useCompanyDashboard(viewAsUserId?: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [addingEmployee, setAddingEmployee] = useState(false);

  const targetUserId = viewAsUserId || user?.id;
  const isImpersonating = !!viewAsUserId;

  const { data = EMPTY_DATA, isLoading: loading } = useQuery({
    queryKey: dashboardKey(targetUserId || '', isImpersonating),
    queryFn: () => fetchCompanyDashboard(targetUserId!, isImpersonating),
    enabled: !!targetUserId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const refresh = useCallback(() => {
    if (!targetUserId) return Promise.resolve();
    return qc.invalidateQueries({ queryKey: dashboardKey(targetUserId, isImpersonating) });
  }, [qc, targetUserId, isImpersonating]);

  const addEmployee = async (fullName: string, email?: string) => {
    const company = data.company;
    if (!company) return;
    setAddingEmployee(true);

    try {
      // Server-canonical capacity preflight. Final decision belongs to
      // the edge function (create_student_profile_with_capacity).
      const { data: capRows } = await supabase.rpc(
        "get_organization_student_capacity" as any,
        { p_organization_id: company.organization_id, p_requested_count: 1 },
      );
      const cap: any = Array.isArray(capRows) ? capRows[0] : capRows;
      if (cap && !cap.is_unlimited && !cap.can_add) {
        toast.error("Лимит учеников", {
          description: `Достигнут лимит: ${cap.current_students} из ${cap.max_students}. Обратитесь к организации.`,
        });
        setAddingEmployee(false);
        return;
      }

      const { data: result, error } = await safeInvoke<any>('register-student', {
        body: {
          full_name: fullName,
          email: email || undefined,
          organization_id: company.organization_id,
          company_id: company.id,
        },
      });

      if (error) throw error;
      if ((result as any)?.error) {
        const code = (result as any).code;
        if (code === "STUDENT_LIMIT_EXCEEDED") {
          toast.error("Лимит учеников", { description: (result as any).error });
        } else {
          toast.error("Ошибка", { description: (result as any).error });
        }
        return;
      }

      toast.success("Сотрудник добавлен", { description: `${fullName} зарегистрирован в системе` });

      await refresh();
      return result;
    } catch (error) {
      toast.error("Ошибка", { description: getErrorMessage(error, 'Не удалось добавить сотрудника') });
    } finally {
      setAddingEmployee(false);
    }
  };

  return useMemo(() => ({
    company: data.company,
    employees: data.employees,
    stats: data.stats,
    loading,
    addingEmployee,
    addEmployee,
    refresh,
  }), [data, loading, addingEmployee, refresh]);
}
