import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BlacklistEntry {
  id: string;
  inn: string;
  org_name: string | null;
  reason: string | null;
  added_by: string | null;
  added_at: string;
}

export function useSalesBlacklist() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['sales_blacklist'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('sales_blacklist')
        .select('*')
        .order('added_at', { ascending: false });
      if (error) throw error;
      return (data || []) as BlacklistEntry[];
    },
  });

  const add = useMutation({
    mutationFn: async (input: { inn: string; org_name?: string; reason?: string; organization_id?: string | null }) => {
      const { data: u } = await supabase.auth.getUser();
      let orgId = input.organization_id ?? null;
      if (orgId === null && u.user?.id) {
        const { data: p } = await supabase.from('profiles').select('organization_id').eq('user_id', u.user.id).maybeSingle();
        orgId = p?.organization_id ?? null;
      }
      const { error } = await (supabase as any)
        .from('sales_blacklist')
        .insert({ ...input, organization_id: orgId, added_by: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Добавлено в чёрный список');
      qc.invalidateQueries({ queryKey: ['sales_blacklist'] });
    },
    onError: (e: Error) => toast.error(`Ошибка: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('sales_blacklist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Удалено из чёрного списка');
      qc.invalidateQueries({ queryKey: ['sales_blacklist'] });
    },
  });

  return { list, add, remove };
}
