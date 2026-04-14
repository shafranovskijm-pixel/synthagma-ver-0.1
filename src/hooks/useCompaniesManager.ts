import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { safeInvoke } from "@/utils/safeInvoke";
import { toast } from "sonner";

interface Company {
  id: string;
  name: string;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  address: string | null;
  director: string | null;
  email: string | null;
  created_at: string;
  user_id?: string | null;
  login_email?: string | null;
  studentsCount?: number;
  stamp_url?: string | null;
  signature_url?: string | null;
}

interface CompanyDocument {
  id: string;
  company_id: string;
  type: 'contract' | 'invoice' | 'act' | 'other';
  name: string;
  file_url: string | null;
  file_path: string | null;
  file_size: number | null;
  uploaded_at: string;
  is_paid: boolean | null;
  paid_at: string | null;
  amount: number | null;
  contract_number: string | null;
}

interface CompanyStudent {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  created_at: string;
  enrollments: {
    course_title: string;
    progress: number;
    status: string;
  }[];
}

interface LinkStudent {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  login: string | null;
  created_at: string;
}

interface DadataCompanyInfo {
  name: string;
  fullName: string;
  shortName: string;
  inn: string;
  kpp: string | null;
  ogrn: string | null;
  address: string | null;
  management: string | null;
  status: string | null;
  type: string | null;
  opf: string | null;
}

interface GlobalDocStats {
  contracts: number;
  invoices: number;
  paidInvoices: number;
  unpaidInvoices: number;
  paidAmount: number;
  unpaidAmount: number;
}

export function useCompaniesManager(organizationId: string) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Global document stats
  const [globalDocStats, setGlobalDocStats] = useState<GlobalDocStats>({
    contracts: 0,
    invoices: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
    paidAmount: 0,
    unpaidAmount: 0,
  });

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyInn, setNewCompanyInn] = useState("");
  const [newCompanyEmail, setNewCompanyEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSearchingDadata, setIsSearchingDadata] = useState(false);
  const [dadataCompanyInfo, setDadataCompanyInfo] = useState<DadataCompanyInfo | null>(null);

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editCompanyInn, setEditCompanyInn] = useState("");
  const [editCompanyEmail, setEditCompanyEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSearchingDadataEdit, setIsSearchingDadataEdit] = useState(false);
  const [dadataEditCompanyInfo, setDadataEditCompanyInfo] = useState<DadataCompanyInfo | null>(null);

  // Delete confirm state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchCompanies = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: companiesData, error } = await supabase
        .from("companies")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");

      if (error) throw error;

      // Get student counts for each company
      const companiesWithCounts = await Promise.all(
        (companiesData || []).map(async (company) => {
          const { count } = await supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("company_id", company.id);

          return { ...company, studentsCount: count || 0 };
        })
      );

      setCompanies(companiesWithCounts);
    } catch (error) {
      console.error("Error fetching companies:", error);
      toast.error("Ошибка загрузки организаций");
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  const fetchGlobalDocStats = useCallback(async () => {
    try {
      // Get all company IDs for this organization
      const { data: companiesData } = await supabase
        .from("companies")
        .select("id")
        .eq("organization_id", organizationId);

      if (!companiesData || companiesData.length === 0) {
        setGlobalDocStats({
          contracts: 0,
          invoices: 0,
          paidInvoices: 0,
          unpaidInvoices: 0,
          paidAmount: 0,
          unpaidAmount: 0,
        });
        return;
      }

      const companyIds = companiesData.map(c => c.id);

      const { data: docs } = await supabase
        .from("company_documents")
        .select("type, is_paid, amount")
        .in("company_id", companyIds);

      if (!docs) return;

      const stats = {
        contracts: docs.filter(d => d.type === 'contract').length,
        invoices: docs.filter(d => d.type === 'invoice').length,
        paidInvoices: docs.filter(d => d.type === 'invoice' && d.is_paid).length,
        unpaidInvoices: docs.filter(d => d.type === 'invoice' && !d.is_paid).length,
        paidAmount: docs.filter(d => d.is_paid).reduce((sum, d) => sum + (d.amount || 0), 0),
        unpaidAmount: docs.filter(d => !d.is_paid && d.type === 'invoice').reduce((sum, d) => sum + (d.amount || 0), 0),
      };

      setGlobalDocStats(stats);
    } catch (error) {
      console.error("Error fetching global doc stats:", error);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchCompanies();
    fetchGlobalDocStats();
  }, [fetchCompanies, fetchGlobalDocStats]);

  const searchDadata = async (inn: string) => {
    if (inn.length < 10) return;
    
    setIsSearchingDadata(true);
    try {
      const { data, error } = await safeInvoke<any>("dadata-company", {
        body: { inn }
      });

      if (error) throw error;

      if (data?.success && data?.company) {
        const c = data.company;
        const companyInfo: DadataCompanyInfo = {
          name: c.name,
          fullName: c.fullName || c.name,
          shortName: c.shortName || c.name,
          inn: c.inn,
          kpp: c.kpp || null,
          ogrn: c.ogrn || null,
          address: c.address || null,
          management: c.management || null,
          status: c.status || null,
          type: c.type || null,
          opf: c.opf || null,
        };
        setDadataCompanyInfo(companyInfo);
        setNewCompanyName(companyInfo.shortName);
      } else {
        setDadataCompanyInfo(null);
        if (!data?.success) {
          toast.info("Компания не найдена по ИНН");
        }
      }
    } catch (error) {
      console.error("Error searching dadata:", error);
    } finally {
      setIsSearchingDadata(false);
    }
  };

  const createCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error("Введите название организации");
      return;
    }

    setIsCreating(true);
    try {
      const { error } = await supabase.from("companies").insert({
        organization_id: organizationId,
        name: newCompanyName.trim(),
        inn: dadataCompanyInfo?.inn || newCompanyInn.trim() || null,
        kpp: dadataCompanyInfo?.kpp || null,
        ogrn: dadataCompanyInfo?.ogrn || null,
        address: dadataCompanyInfo?.address || null,
        director: dadataCompanyInfo?.management || null,
        email: newCompanyEmail.trim() || null,
      } as any);

      if (error) throw error;

      toast.success("Организация создана");
      setShowCreateDialog(false);
      setNewCompanyName("");
      setNewCompanyInn("");
      setNewCompanyEmail("");
      setDadataCompanyInfo(null);
      fetchCompanies();
    } catch (error) {
      console.error("Error creating company:", error);
      toast.error("Ошибка создания организации");
    } finally {
      setIsCreating(false);
    }
  };

  const openEditDialog = (company: Company) => {
    setEditingCompany(company);
    setEditCompanyName(company.name);
    setEditCompanyInn(company.inn || "");
    setEditCompanyEmail(company.email || "");
    setDadataEditCompanyInfo(null);
    setShowEditDialog(true);
  };

  const saveCompany = async () => {
    if (!editingCompany || !editCompanyName.trim()) {
      toast.error("Введите название организации");
      return;
    }

    setIsSaving(true);
    try {
      const updateData: Record<string, string | null> = {
        name: editCompanyName.trim(),
        inn: dadataEditCompanyInfo?.inn || editCompanyInn.trim() || editingCompany.inn,
        email: editCompanyEmail.trim() || null,
      };

      if (dadataEditCompanyInfo) {
        updateData.kpp = dadataEditCompanyInfo.kpp;
        updateData.ogrn = dadataEditCompanyInfo.ogrn;
        updateData.address = dadataEditCompanyInfo.address;
        updateData.director = dadataEditCompanyInfo.management;
      }

      const { error } = await supabase
        .from("companies")
        .update(updateData)
        .eq("id", editingCompany.id);

      if (error) throw error;

      toast.success("Организация обновлена");
      setShowEditDialog(false);
      setEditingCompany(null);
      setDadataEditCompanyInfo(null);
      fetchCompanies();
    } catch (error) {
      console.error("Error updating company:", error);
      toast.error("Ошибка обновления организации");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCompany = async () => {
    if (!deletingCompany) return;

    setIsDeleting(true);
    try {
      // First detach students from company
      await supabase
        .from("profiles")
        .update({ company_id: null })
        .eq("company_id", deletingCompany.id);

      // Delete registration links
      await supabase
        .from("registration_links")
        .delete()
        .eq("company_id", deletingCompany.id);

      // Delete company documents
      await supabase
        .from("company_documents")
        .delete()
        .eq("company_id", deletingCompany.id);

      // Delete company
      const { error } = await supabase
        .from("companies")
        .delete()
        .eq("id", deletingCompany.id);

      if (error) throw error;

      toast.success("Организация удалена");
      setShowDeleteConfirm(false);
      setDeletingCompany(null);
      fetchCompanies();
    } catch (error) {
      console.error("Error deleting company:", error);
      toast.error("Ошибка удаления организации");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCompanies = companies.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.inn && c.inn.includes(searchQuery))
  );

  return {
    // Data
    companies,
    filteredCompanies,
    isLoading,
    searchQuery,
    setSearchQuery,
    globalDocStats,
    
    // Create dialog
    showCreateDialog,
    setShowCreateDialog,
    newCompanyName,
    setNewCompanyName,
    newCompanyInn,
    setNewCompanyInn,
    newCompanyEmail,
    setNewCompanyEmail,
    isCreating,
    isSearchingDadata,
    dadataCompanyInfo,
    setDadataCompanyInfo,
    searchDadata,
    createCompany,
    
    // Edit dialog
    showEditDialog,
    setShowEditDialog,
    editingCompany,
    editCompanyName,
    setEditCompanyName,
    editCompanyInn,
    setEditCompanyInn,
    editCompanyEmail,
    setEditCompanyEmail,
    isSaving,
    isSearchingDadataEdit,
    setIsSearchingDadataEdit,
    dadataEditCompanyInfo,
    setDadataEditCompanyInfo,
    openEditDialog,
    saveCompany,
    
    // Delete confirm
    showDeleteConfirm,
    setShowDeleteConfirm,
    deletingCompany,
    setDeletingCompany,
    isDeleting,
    deleteCompany,
    
    // Refresh
    refreshCompanies: fetchCompanies,
    fetchGlobalDocStats,
  };
}

export type { Company, CompanyDocument, CompanyStudent, LinkStudent, DadataCompanyInfo, GlobalDocStats };
