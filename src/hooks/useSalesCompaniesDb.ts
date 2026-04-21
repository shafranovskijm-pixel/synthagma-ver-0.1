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
  kpp: string | null;
  okpo: string | null;
  registration_date: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  phone: string | null;
  phones: string[] | null;
  email: string | null;
  emails: string[] | null;
  website: string | null;
  social_links: Record<string, string | null> | null;
  director: string | null;
  director_inn: string | null;
  director_position: string | null;
  okved_main: string | null;
  okved_list: any | null;
  licenses: any | null;
  license_number: string | null;
  license_issue_date: string | null;
  license_authority: string | null;
  license_activities: string[] | null;
  license_valid_to: string | null;
  has_education_license: boolean;
  status: string | null;
  employee_count: number | null;
  charter_capital: number | null;
  unfair_supplier: boolean | null;
  mass_director: boolean | null;
  mass_address: boolean | null;
  sanctions: boolean | null;
  branches_count: number | null;
  last_data_date: string | null;
  source_url: string | null;
  data_source: string | null;
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
      return (data || []) as unknown as SalesCompanyDbRow[];
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

  return { list, convertToLead, remove };
}
