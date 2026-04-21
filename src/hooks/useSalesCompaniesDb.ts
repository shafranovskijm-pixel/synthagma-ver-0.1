import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SalesCompanyDbRow {
  id: string;
  inn: string;
  ogrn: string | null;
  name: string;
  short_name: string | null;
  full_name: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  director: string | null;
  director_position: string | null;
  okved_main: string | null;
  license_number: string | null;
  license_issue_date: string | null;
  license_authority: string | null;
  license_activities: string[] | null;
  license_valid_to: string | null;
  has_education_license: boolean;
  status: string | null;
  source_url: string | null;
  parsed_at: string;
  converted_to_lead_id: string | null;
  created_at: string;
}

export function useSalesCompaniesDb() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['sales_companies_db'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_companies_db')
        .select('*')
        .order('parsed_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as SalesCompanyDbRow[];
    },
  });

  const parsePages = useMutation({
    mutationFn: async ({ searchUrl, pages }: { searchUrl: string; pages: number }) => {
      const { data, error } = await supabase.functions.invoke('parse-list-org', {
        body: { searchUrl, pages },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { found: number; inserted: number; updated: number; skipped: number; errors: string[] };
    },
    onSuccess: (data) => {
      toast.success(
        `Парсинг готов: найдено ${data.found}, добавлено ${data.inserted}, обновлено ${data.updated}, пропущено ${data.skipped}`,
      );
      if (data.errors?.length) {
        console.warn('[parse-list-org] errors:', data.errors);
      }
      qc.invalidateQueries({ queryKey: ['sales_companies_db'] });
    },
    onError: (err: Error) => {
      toast.error(`Ошибка парсинга: ${err.message}`);
    },
  });

  const convertToLead = useMutation({
    mutationFn: async (companyDbId: string) => {
      const { data, error } = await supabase.functions.invoke('convert-company-to-lead', {
        body: { companyDbId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { leadId: string; alreadyExists?: boolean };
    },
    onSuccess: (data) => {
      toast.success(data.alreadyExists ? 'Лид уже создан' : 'Лид создан');
      qc.invalidateQueries({ queryKey: ['sales_companies_db'] });
    },
    onError: (err: Error) => {
      toast.error(`Не удалось создать лид: ${err.message}`);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sales_companies_db').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Удалено');
      qc.invalidateQueries({ queryKey: ['sales_companies_db'] });
    },
  });

  return { list, parsePages, convertToLead, remove };
}
