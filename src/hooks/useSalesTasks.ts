import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SalesTask {
  id: string;
  lead_id: string | null;
  manager_id: string | null;
  due_date: string;
  title: string;
  description: string | null;
  status: 'pending' | 'done' | 'cancelled';
  type: 'call' | 'email' | 'meeting' | 'followup' | 'other';
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useSalesTasks(filter?: { leadId?: string; managerId?: string; onlyOpen?: boolean }) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['sales_tasks', filter],
    queryFn: async () => {
      let q = (supabase as any).from('sales_tasks').select('*').order('due_date', { ascending: true });
      if (filter?.leadId) q = q.eq('lead_id', filter.leadId);
      if (filter?.managerId) q = q.eq('manager_id', filter.managerId);
      if (filter?.onlyOpen) q = q.eq('status', 'pending');
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as SalesTask[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: Omit<SalesTask, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'created_by'> & { organization_id?: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      // Auto-resolve organization_id from current user's profile if not provided
      let orgId = input.organization_id ?? null;
      if (orgId === null && u.user?.id) {
        const { data: p } = await supabase.from('profiles').select('organization_id').eq('user_id', u.user.id).maybeSingle();
        orgId = p?.organization_id ?? null;
      }
      const { data, error } = await (supabase as any)
        .from('sales_tasks')
        .insert({ ...input, organization_id: orgId, created_by: u.user?.id })
        .select()
        .single();
      if (error) throw error;
      return data as SalesTask;
    },
    onSuccess: () => {
      toast.success('Задача создана');
      qc.invalidateQueries({ queryKey: ['sales_tasks'] });
    },
    onError: (e: Error) => toast.error(`Ошибка: ${e.message}`),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('sales_tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Задача выполнена');
      qc.invalidateQueries({ queryKey: ['sales_tasks'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('sales_tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Удалено');
      qc.invalidateQueries({ queryKey: ['sales_tasks'] });
    },
  });

  return { list, create, complete, remove };
}
