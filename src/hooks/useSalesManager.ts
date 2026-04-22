import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeInvoke } from '@/utils/safeInvoke';
import { useAuth } from '@/hooks/useAuth';
import { toast } from "sonner";
export interface SalesService {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface SalesManager {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CommercialProposal {
  id: string;
  created_by: string;
  manager_id: string | null;
  company_name: string;
  company_inn: string | null;
  company_email: string | null;
  company_phone: string | null;
  contact_person: string | null;
  tariff_plan: string | null;
  custom_note: string | null;
  total_amount: number;
  discount_percent: number;
  sender_name: string | null;
  sender_email: string | null;
  sender_website: string | null;
  status: string;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  preset_id?: string | null;
  intro_html?: string | null;
  outro_html?: string | null;
}

export interface ProposalServiceItem {
  id: string;
  proposal_id: string;
  service_id: string | null;
  custom_name: string;
  custom_description: string | null;
  price: number;
  quantity: number;
  sort_order: number;
}

export interface SalesLead {
  id: string;
  org_name: string;
  inn: string | null;
  ogrn: string | null;
  license_number: string | null;
  license_date: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  assigned_manager_id: string | null;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  last_contact_at: string | null;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  manager_id: string;
  activity_type: string;
  description: string | null;
  created_at: string;
}

export function useSalesManager() {
  const { user } = useAuth();
  const [services, setServices] = useState<SalesService[]>([]);
  const [managers, setManagers] = useState<SalesManager[]>([]);
  const [proposals, setProposals] = useState<CommercialProposal[]>([]);
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchServices = useCallback(async () => {
    const { data, error } = await supabase.from('sales_services').select('*').order('sort_order');
    if (data && !error) setServices(data as unknown as SalesService[]);
  }, []);

  const fetchManagers = useCallback(async () => {
    const { data, error } = await supabase.from('sales_managers').select('*').order('created_at', { ascending: false });
    if (data && !error) setManagers(data as unknown as SalesManager[]);
  }, []);

  const fetchProposals = useCallback(async (organizationId?: string) => {
    let query = supabase
      .from('commercial_proposals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data, error } = await query;
    if (data && !error) setProposals(data as unknown as CommercialProposal[]);
  }, []);

  const fetchLeads = useCallback(async (
    filters?: { region?: string; status?: string; managerId?: string; organizationId?: string }
  ) => {
    let query = supabase
      .from('sales_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (filters?.region) query = query.eq('region', filters.region);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.managerId) query = query.eq('assigned_manager_id', filters.managerId);
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId);
    const { data, error } = await query;
    if (data && !error) setLeads(data as unknown as SalesLead[]);
  }, []);

  const fetchActivities = useCallback(async (leadId?: string, organizationId?: string) => {
    let query = supabase.from('sales_lead_activities').select('*').order('created_at', { ascending: false });
    if (leadId) query = query.eq('lead_id', leadId);
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data, error } = await query.limit(200);
    if (data && !error) setActivities(data as unknown as LeadActivity[]);
  }, []);

  // Services CRUD
  const createService = async (name: string, description: string, price: number) => {
    const { error } = await supabase.from('sales_services').insert({ name, description, price } as any);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    toast.success("Услуга создана");
    await fetchServices();
    return true;
  };

  const updateService = async (id: string, updates: Partial<SalesService>) => {
    const { error } = await supabase.from('sales_services').update(updates as any).eq('id', id);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    await fetchServices();
    return true;
  };

  const deleteService = async (id: string) => {
    const { error } = await supabase.from('sales_services').delete().eq('id', id);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    toast.success("Услуга удалена");
    await fetchServices();
    return true;
  };

  // Proposals CRUD
  const createProposal = async (proposal: Partial<CommercialProposal>, serviceItems: Partial<ProposalServiceItem>[]) => {
    if (!user) return null;
    const { data, error } = await supabase.from('commercial_proposals').insert({ ...proposal, created_by: user.id } as any).select().single();
    if (error || !data) { toast.error("Ошибка", { description: error?.message }); return null; }
    const proposalData = data as unknown as CommercialProposal;
    if (serviceItems.length > 0) {
      const items = serviceItems.map((s, i) => ({ ...s, proposal_id: proposalData.id, sort_order: i }));
      await supabase.from('commercial_proposal_services').insert(items as any);
    }
    toast.success("КП создано");
    await fetchProposals();
    return proposalData;
  };

  const updateProposal = async (id: string, proposal: Partial<CommercialProposal>, serviceItems: Partial<ProposalServiceItem>[]) => {
    const { error } = await supabase.from('commercial_proposals').update(proposal as any).eq('id', id);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    // Replace service items
    await supabase.from('commercial_proposal_services').delete().eq('proposal_id', id);
    if (serviceItems.length > 0) {
      const items = serviceItems.map((s, i) => ({ ...s, proposal_id: id, sort_order: i }));
      await supabase.from('commercial_proposal_services').insert(items as any);
    }
    toast.success("КП обновлено");
    await fetchProposals();
    return true;
  };

  const updateProposalStatus = async (id: string, status: string) => {
    const { error } = await supabase.from('commercial_proposals').update({ status } as any).eq('id', id);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    await fetchProposals();
    return true;
  };

  const deleteProposal = async (id: string) => {
    const { error } = await supabase.from('commercial_proposals').delete().eq('id', id);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    toast.success("КП удалено");
    await fetchProposals();
    return true;
  };

  const getProposalServices = async (proposalId: string) => {
    const { data } = await supabase.from('commercial_proposal_services').select('*').eq('proposal_id', proposalId).order('sort_order');
    return (data || []) as unknown as ProposalServiceItem[];
  };

  // Leads
  const importLeads = async (leadsData: Partial<SalesLead>[]) => {
    setLoading(true);
    const batchSize = 100;
    let imported = 0;
    for (let i = 0; i < leadsData.length; i += batchSize) {
      const batch = leadsData.slice(i, i + batchSize);
      const { error } = await supabase.from('sales_leads').insert(batch as any);
      if (error) {
        toast.error("Ошибка импорта", { description: `Батч ${i / batchSize + 1}: ${error.message}` });
      } else {
        imported += batch.length;
      }
    }
    toast.success("Импорт завершён", { description: `Импортировано ${imported} компаний` });
    setLoading(false);
    await fetchLeads();
    return imported;
  };

  const assignLeads = async (leadIds: string[], managerId: string | null) => {
    const { error } = await supabase.from('sales_leads').update({ assigned_manager_id: managerId, status: managerId ? 'in_progress' : 'new' } as any).in('id', leadIds);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    toast.success(managerId ? 'Компании назначены менеджеру' : 'Назначение снято');
    await fetchLeads();
    return true;
  };

  const updateLeadStatus = async (leadId: string, status: string) => {
    const { error } = await supabase.from('sales_leads').update({ status, last_contact_at: new Date().toISOString() } as any).eq('id', leadId);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    await fetchLeads();
    return true;
  };

  const updateLeadNotes = async (leadId: string, notes: string) => {
    const { error } = await supabase.from('sales_leads').update({ notes } as any).eq('id', leadId);
    if (error) return false;
    await fetchLeads();
    return true;
  };

  // Activities
  const addActivity = async (leadId: string, managerId: string, activityType: string, description: string) => {
    const { error } = await supabase.from('sales_lead_activities').insert({ lead_id: leadId, manager_id: managerId, activity_type: activityType, description } as any);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    // Update last_contact_at
    await supabase.from('sales_leads').update({ last_contact_at: new Date().toISOString() } as any).eq('id', leadId);
    await fetchActivities(leadId);
    return true;
  };

  // Create sales manager via edge function
  const createManager = async (email: string, password: string, fullName: string, phone?: string) => {
    setLoading(true);
    try {
      const { data, error } = await safeInvoke<any>('create-sales-manager', {
        body: { email, password, full_name: fullName, phone }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Менеджер создан", { description: `${fullName} (${email})` });
      await fetchManagers();
      return true;
    } catch (err: any) {
      toast.error("Ошибка создания менеджера", { description: err.message });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const toggleManagerActive = async (id: string, isActive: boolean) => {
    const { error } = await supabase.from('sales_managers').update({ is_active: isActive } as any).eq('id', id);
    if (error) { toast.error("Ошибка", { description: error.message }); return false; }
    await fetchManagers();
    return true;
  };

  return {
    services, managers, proposals, leads, activities, loading,
    fetchServices, fetchManagers, fetchProposals, fetchLeads, fetchActivities,
    createService, updateService, deleteService,
    createProposal, updateProposal, updateProposalStatus, deleteProposal, getProposalServices,
    importLeads, assignLeads, updateLeadStatus, updateLeadNotes,
    addActivity, createManager, toggleManagerActive
  };
}
