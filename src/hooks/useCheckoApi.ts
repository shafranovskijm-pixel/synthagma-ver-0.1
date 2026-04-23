import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CheckoStats {
  today_used: number;
  today_remaining: number;
  daily_limit: number;
  search_used: number;
  search_remaining: number;
  search_daily_limit: number;
  balance: number | null;
  auto_enrich_enabled: boolean;
  last_auto_run_at: string | null;
  last_auto_processed: number | null;
  last_auto_error: string | null;
  queue_size: number;
  total_companies: number;
  reset_at_msk: string;
}

export interface EnrichResult {
  processed: number;
  skipped_quota: number;
  queued_inns: string[];
  invalid_inns: string[];
  errors: { inn: string; error: string }[];
  today_used: number;
  today_remaining: number;
  balance: number | null;
  stop_reason: string | null;
}

export function useCheckoApi() {
  const qc = useQueryClient();

  const stats = useQuery({
    queryKey: ['checko_stats'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('checko-stats', { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as CheckoStats;
    },
    // Поллинг только когда вкладка активна — экономим запросы к edge-функции
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? 30000 : false,
    refetchIntervalInBackground: false,
  });

  const enrichBatch = useMutation({
    mutationFn: async (vars: { inns: string[]; mode: 'add' | 'refresh' }) => {
      const { data, error } = await supabase.functions.invoke('checko-enrich-batch', { body: vars });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as EnrichResult;
    },
    onSuccess: (data) => {
      const parts = [`обогащено ${data.processed}`];
      if (data.queued_inns.length) parts.push(`в очереди ${data.queued_inns.length}`);
      if (data.invalid_inns.length) parts.push(`некорректных ИНН ${data.invalid_inns.length}`);
      if (data.errors.length) parts.push(`ошибок ${data.errors.length}`);
      const msg = `Готово: ${parts.join(', ')}. Квота сегодня: ${data.today_used}/100.`;
      if (data.stop_reason === 'quota_exhausted') {
        toast.warning(msg + ' Дневная квота исчерпана.');
      } else {
        toast.success(msg);
      }
      qc.invalidateQueries({ queryKey: ['sales_companies_db'] });
      qc.invalidateQueries({ queryKey: ['checko_stats'] });
    },
    onError: (e: Error) => toast.error(`Ошибка обогащения: ${e.message}`),
  });

  const setAutoEnrich = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('checko_settings')
        .update({ auto_enrich_enabled: enabled, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      toast.success(enabled ? 'Автообновление включено (03:00 МСК ежедневно)' : 'Автообновление выключено');
      qc.invalidateQueries({ queryKey: ['checko_stats'] });
    },
    onError: (e: Error) => toast.error(`Не удалось обновить настройку: ${e.message}`),
  });

  const runManualNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('checko-daily-enrich', { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.skipped) {
        toast.info('Автообновление выключено — включите переключатель.');
      } else {
        toast.success(`Запуск выполнен: обогащено ${data.processed ?? 0}, в очереди ${data.queued_inns?.length ?? 0}.`);
      }
      qc.invalidateQueries({ queryKey: ['sales_companies_db'] });
      qc.invalidateQueries({ queryKey: ['checko_stats'] });
    },
    onError: (e: Error) => toast.error(`Ошибка запуска: ${e.message}`),
  });

  return { stats, enrichBatch, setAutoEnrich, runManualNow };
}
