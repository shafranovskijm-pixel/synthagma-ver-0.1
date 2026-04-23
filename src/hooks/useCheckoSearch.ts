import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CheckoSearchPreset {
  id: string;
  organization_id: string | null;
  name: string;
  regions: number[];
  licenses: string[];
  okveds: string[];
  active_only: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckoSearchRun {
  id: string;
  preset_id: string | null;
  regions: number[];
  licenses: string[];
  okveds: string[];
  active_only: boolean;
  found_count: number;
  enriched_count: number;
  queued_count: number;
  search_requests_used: number;
  status: string;
  error_message: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CheckoSearchParams {
  regions: number[];
  licenses: string[];
  okveds: string[];
  activeOnly: boolean;
  limit: number;
  autoEnrich: boolean;
  presetId?: string | null;
}

export interface CheckoSearchCount {
  total: number;
  estimated_search_requests: number;
  search_used_today: number;
  search_remaining: number;
}

export interface CheckoSearchResult {
  total: number;
  found_count: number;
  found_inns: string[];
  enriched_count: number;
  queued_count: number;
  search_requests_used: number;
  search_remaining: number;
  enrich_result: any;
}

export function useCheckoSearch() {
  const qc = useQueryClient();

  const presets = useQuery({
    queryKey: ['checko_search_presets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checko_search_presets')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CheckoSearchPreset[];
    },
  });

  const runs = useQuery({
    queryKey: ['checko_search_runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checko_search_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as CheckoSearchRun[];
    },
  });

  const countSearch = useMutation({
    mutationFn: async (vars: Omit<CheckoSearchParams, 'autoEnrich' | 'limit'>) => {
      const { data, error } = await supabase.functions.invoke('checko-search', {
        body: { ...vars, countOnly: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as CheckoSearchCount;
    },
    onError: (e: Error) => toast.error(`Не удалось оценить выборку: ${e.message}`),
  });

  const runSearch = useMutation({
    mutationFn: async (vars: CheckoSearchParams) => {
      const { data, error } = await supabase.functions.invoke('checko-search', { body: vars });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as CheckoSearchResult;
    },
    onSuccess: (data) => {
      const parts = [`найдено ${data.found_count}`];
      if (data.enriched_count) parts.push(`обогащено ${data.enriched_count}`);
      if (data.queued_count) parts.push(`в очереди ${data.queued_count}`);
      toast.success(`Подбор завершён: ${parts.join(', ')} (запросов поиска: ${data.search_requests_used})`);
      qc.invalidateQueries({ queryKey: ['sales_companies_db'] });
      qc.invalidateQueries({ queryKey: ['checko_stats'] });
      qc.invalidateQueries({ queryKey: ['checko_search_runs'] });
    },
    onError: (e: Error) => toast.error(`Ошибка поиска: ${e.message}`),
  });

  const savePreset = useMutation({
    mutationFn: async (vars: { id?: string; name: string; regions: number[]; licenses: string[]; okveds: string[]; active_only: boolean }) => {
      const { id, ...payload } = vars;
      if (id) {
        const { data, error } = await supabase
          .from('checko_search_presets')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('checko_search_presets')
        .insert({ ...payload, created_by: user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Пресет сохранён');
      qc.invalidateQueries({ queryKey: ['checko_search_presets'] });
    },
    onError: (e: Error) => toast.error(`Не удалось сохранить пресет: ${e.message}`),
  });

  const deletePreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('checko_search_presets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Пресет удалён');
      qc.invalidateQueries({ queryKey: ['checko_search_presets'] });
    },
  });

  return { presets, runs, countSearch, runSearch, savePreset, deletePreset };
}
