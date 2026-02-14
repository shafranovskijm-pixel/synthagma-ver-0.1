import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Company } from "@/hooks/useCompaniesManager";

export interface OrgRequisites {
  name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  legal_address: string;
  actual_address: string;
  director_name: string;
  director_position: string;
  bank_name: string;
  bank_bik: string;
  bank_account: string;
  bank_corr_account: string;
  stamp_url?: string | null;
  signature_url?: string | null;
}

export function useCompanyLinksAndGenerators(organizationId: string) {
  // Categories
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from("course_categories")
        .select("id, name, color")
        .eq("organization_id", organizationId);
      if (data) setCategories(data.map(c => ({ ...c, color: c.color || '#888' })));
    };
    fetchCategories();
  }, [organizationId]);

  const getCategoryById = useCallback((id?: string | null) => {
    if (!id) return undefined;
    return categories.find(c => c.id === id);
  }, [categories]);

  // View mode
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Org requisites
  const [orgRequisites, setOrgRequisites] = useState<OrgRequisites | null>(null);

  useEffect(() => {
    const fetchOrgRequisites = async () => {
      try {
        const { data, error } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", organizationId)
          .single();
        if (error) throw error;
        if (data) {
          setOrgRequisites({
            name: data.name || "",
            inn: data.inn || "",
            kpp: data.kpp || "",
            ogrn: data.ogrn || "",
            legal_address: data.legal_address || "",
            actual_address: data.actual_address || "",
            director_name: data.director_name || "",
            director_position: data.director_position || "",
            bank_name: data.bank_name || "",
            bank_bik: data.bank_bik || "",
            bank_account: data.bank_account || "",
            bank_corr_account: data.bank_corr_account || "",
            stamp_url: data.stamp_url,
            signature_url: data.signature_url,
          });
        }
      } catch (error) {
        console.error("Error fetching org requisites:", error);
      }
    };
    fetchOrgRequisites();
  }, [organizationId]);

  // Links dialog
  const [showLinksDialog, setShowLinksDialog] = useState(false);
  const [selectedCompanyForLinks, setSelectedCompanyForLinks] = useState<Company | null>(null);
  const [companyLinks, setCompanyLinks] = useState<any[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkExpiresDays, setNewLinkExpiresDays] = useState("");

  const fetchCompanyLinks = useCallback(async (companyId: string) => {
    setIsLoadingLinks(true);
    try {
      const { data, error } = await supabase
        .from("registration_links")
        .select("id, token, name, expires_at, used_count")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCompanyLinks(data || []);
    } catch (error) {
      console.error("Error fetching links:", error);
    } finally {
      setIsLoadingLinks(false);
    }
  }, []);

  const openLinksDialog = async (company: Company) => {
    setSelectedCompanyForLinks(company);
    setShowLinksDialog(true);
    setNewLinkName("");
    setNewLinkExpiresDays("");
    await fetchCompanyLinks(company.id);
  };

  const createLink = async () => {
    if (!selectedCompanyForLinks) return;
    setIsCreatingLink(true);
    try {
      const token = crypto.randomUUID().slice(0, 8);
      const expiresAt = newLinkExpiresDays
        ? new Date(Date.now() + parseInt(newLinkExpiresDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;
      const { error } = await supabase.from("registration_links").insert({
        organization_id: organizationId,
        company_id: selectedCompanyForLinks.id,
        token,
        name: newLinkName || null,
        expires_at: expiresAt,
      });
      if (error) throw error;
      toast.success("Ссылка создана");
      setNewLinkName("");
      setNewLinkExpiresDays("");
      await fetchCompanyLinks(selectedCompanyForLinks.id);
    } catch (error) {
      console.error("Error creating link:", error);
      toast.error("Ошибка создания ссылки");
    } finally {
      setIsCreatingLink(false);
    }
  };

  const deleteLink = async (linkId: string) => {
    try {
      const { error } = await supabase.from("registration_links").delete().eq("id", linkId);
      if (error) throw error;
      toast.success("Ссылка удалена");
      if (selectedCompanyForLinks) {
        await fetchCompanyLinks(selectedCompanyForLinks.id);
      }
    } catch (error) {
      console.error("Error deleting link:", error);
      toast.error("Ошибка удаления ссылки");
    }
  };

  // Document generators
  const [showContractGenerator, setShowContractGenerator] = useState(false);
  const [showInvoiceGenerator, setShowInvoiceGenerator] = useState(false);
  const [showActGenerator, setShowActGenerator] = useState(false);
  const [selectedCompanyForGenerator, setSelectedCompanyForGenerator] = useState<Company | null>(null);

  const openContractGenerator = (company: Company) => {
    setSelectedCompanyForGenerator(company);
    setShowContractGenerator(true);
  };
  const openInvoiceGenerator = (company: Company) => {
    setSelectedCompanyForGenerator(company);
    setShowInvoiceGenerator(true);
  };
  const openActGenerator = (company: Company) => {
    setSelectedCompanyForGenerator(company);
    setShowActGenerator(true);
  };
  const closeContractGenerator = () => { setShowContractGenerator(false); setSelectedCompanyForGenerator(null); };
  const closeInvoiceGenerator = () => { setShowInvoiceGenerator(false); setSelectedCompanyForGenerator(null); };
  const closeActGenerator = () => { setShowActGenerator(false); setSelectedCompanyForGenerator(null); };

  return {
    categories, getCategoryById,
    viewMode, setViewMode,
    orgRequisites,
    // Links
    showLinksDialog, setShowLinksDialog,
    selectedCompanyForLinks, companyLinks,
    isLoadingLinks, isCreatingLink,
    newLinkName, setNewLinkName,
    newLinkExpiresDays, setNewLinkExpiresDays,
    openLinksDialog, createLink, deleteLink,
    // Generators
    showContractGenerator, showInvoiceGenerator, showActGenerator,
    selectedCompanyForGenerator,
    openContractGenerator, openInvoiceGenerator, openActGenerator,
    closeContractGenerator, closeInvoiceGenerator, closeActGenerator,
  };
}
