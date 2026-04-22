import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeInvoke } from '@/utils/safeInvoke';
import { useAuth } from '@/hooks/useAuth';
import { toast } from "sonner";
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

export function useCompanyDashboard(viewAsUserId?: string) {
  const { user } = useAuth();
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [employees, setEmployees] = useState<EmployeeWithProgress[]>([]);
  const [stats, setStats] = useState<CompanyStats>({
    totalEmployees: 0,
    avgProgress: 0,
    completedCourses: 0,
    activeCourses: 0,
  });
  const [loading, setLoading] = useState(true);
  const [addingEmployee, setAddingEmployee] = useState(false);

  const targetUserId = viewAsUserId || user?.id;

  const loadData = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);

    try {
      // 1) Try as company owner
      let { data: companyData } = await supabase
        .from('companies')
        .select('id, name, inn, email, director, organization_id, user_id')
        .eq('user_id', targetUserId)
        .maybeSingle();

      // 2) Fallback: find via company_staff (multi-user B2B access)
      if (!companyData && !viewAsUserId) {
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

      if (!companyData) {
        setLoading(false);
        return;
      }

      setCompany(companyData);

      // Get employees (profiles with this company_id)
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, login')
        .eq('company_id', companyData.id);

      if (!profiles || profiles.length === 0) {
        setEmployees([]);
        setStats({ totalEmployees: 0, avgProgress: 0, completedCourses: 0, activeCourses: 0 });
        setLoading(false);
        return;
      }

      const userIds = profiles.map(p => p.user_id);

      // Get enrollments for these users
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('user_id, course_id, progress, status, completed_at, courses(title)')
        .in('user_id', userIds);

      // Map enrollments to employees
      const employeesWithProgress: EmployeeWithProgress[] = profiles.map(profile => {
        const userEnrollments = (enrollments || [])
          .filter(e => e.user_id === profile.user_id)
          .map(e => ({
            course_id: e.course_id,
            course_title: (e.courses as any)?.title || 'Курс',
            progress: e.progress || 0,
            status: e.status,
            completed_at: e.completed_at,
          }));

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

      setEmployees(employeesWithProgress);

      // Calculate stats
      const allEnrollments = employeesWithProgress.flatMap(e => e.enrollments);
      const completedCount = allEnrollments.filter(e => e.status === 'completed').length;
      const activeCount = allEnrollments.filter(e => e.status === 'active').length;
      const totalAvg = employeesWithProgress.length > 0
        ? Math.round(employeesWithProgress.reduce((sum, e) => sum + e.avg_progress, 0) / employeesWithProgress.length)
        : 0;

      setStats({
        totalEmployees: profiles.length,
        avgProgress: totalAvg,
        completedCourses: completedCount,
        activeCourses: activeCount,
      });
    } catch (error) {
      console.error('Error loading company dashboard:', error);
    } finally {
      setLoading(false);
    }
  }, [targetUserId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const addEmployee = async (fullName: string, email?: string) => {
    if (!company) return;
    setAddingEmployee(true);

    try {
      // Pre-check student limit
      const { data: currentCount } = await supabase.rpc('count_org_students', { org_id: company.organization_id });
      const { data: orgData } = await supabase
        .from('organizations')
        .select('subscription_plan')
        .eq('id', company.organization_id)
        .single();

      const planLimits: Record<string, number> = { free: 10, start: 100, standard: 200, professional: 1000, maximum: -1 };
      const maxStudents = planLimits[orgData?.subscription_plan || 'free'] ?? 10;
      const count = Number(currentCount) || 0;

      if (maxStudents !== -1 && count >= maxStudents) {
        toast.error("Лимит учеников", { description: `Максимум ${maxStudents} учеников на текущем тарифе. Обратитесь к организации.` });
        setAddingEmployee(false);
        return;
      }

      const { data, error } = await safeInvoke<any>('register-student', {
        body: {
          full_name: fullName,
          email: email || undefined,
          organization_id: company.organization_id,
          company_id: company.id,
        },
      });

      if (error) throw error;

      toast.success("Сотрудник добавлен", { description: `${fullName} зарегистрирован в системе` });

      await loadData();
      return data;
    } catch (error: any) {
      toast.error("Ошибка", { description: error.message || 'Не удалось добавить сотрудника' });
    } finally {
      setAddingEmployee(false);
    }
  };

  return {
    company,
    employees,
    stats,
    loading,
    addingEmployee,
    addEmployee,
    refresh: loadData,
  };
}
