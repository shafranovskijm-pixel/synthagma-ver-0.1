import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Company, CompanyDocument, LinkStudent } from "./useCompaniesManager";

export function useCompanyDetailManager(organizationId: string) {
  // Company detail dialog state
  const [showCompanyDetail, setShowCompanyDetail] = useState(false);
  const [selectedCompanyForDetail, setSelectedCompanyForDetail] = useState<Company | null>(null);
  const [companyDocuments, setCompanyDocuments] = useState<CompanyDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState<string | null>(null);
  const [isDeletingDocument, setIsDeletingDocument] = useState<string | null>(null);

  // Students by link tab
  const [linkStudents, setLinkStudents] = useState<LinkStudent[]>([]);
  const [isLoadingLinkStudents, setIsLoadingLinkStudents] = useState(false);
  const [dateFilter, setDateFilter] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [linkStudentSearchQuery, setLinkStudentSearchQuery] = useState("");

  // Document preview dialog
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [previewDocumentHtml, setPreviewDocumentHtml] = useState("");
  const [previewDocumentName, setPreviewDocumentName] = useState("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const fetchLinkStudents = useCallback(async (companyId: string) => {
    setIsLoadingLinkStudents(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, login, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLinkStudents((data || []) as LinkStudent[]);
    } catch (error) {
      console.error("Error fetching link students:", error);
    } finally {
      setIsLoadingLinkStudents(false);
    }
  }, []);

  const fetchCompanyDocuments = useCallback(async (companyId: string) => {
    setIsLoadingDocuments(true);
    try {
      const { data, error } = await supabase
        .from("company_documents")
        .select("*")
        .eq("company_id", companyId)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      setCompanyDocuments((data || []) as CompanyDocument[]);
    } catch (error) {
      console.error("Error fetching company documents:", error);
    } finally {
      setIsLoadingDocuments(false);
    }
  }, []);

  const openCompanyDetail = async (company: Company) => {
    setSelectedCompanyForDetail(company);
    setShowCompanyDetail(true);
    setDateFilter({ from: undefined, to: undefined });
    setLinkStudentSearchQuery("");
    await Promise.all([
      fetchCompanyDocuments(company.id),
      fetchLinkStudents(company.id)
    ]);
  };

  const uploadDocument = async (file: File, type: 'contract' | 'invoice' | 'act' | 'other', companyId: string) => {
    setIsUploadingDocument(type);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${companyId}/${Date.now()}.${fileExt}`;
      const filePath = `company-documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(filePath);

      const { error: insertError } = await supabase
        .from("company_documents")
        .insert({
          company_id: companyId,
          type,
          name: file.name,
          file_url: publicUrl,
          file_path: filePath,
          file_size: file.size,
        });

      if (insertError) throw insertError;

      toast.success("Документ загружен");
      await fetchCompanyDocuments(companyId);
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Ошибка загрузки документа");
    } finally {
      setIsUploadingDocument(null);
    }
  };

  const deleteDocument = async (document: CompanyDocument) => {
    setIsDeletingDocument(document.id);
    try {
      if (document.file_path) {
        await supabase.storage
          .from("documents")
          .remove([document.file_path]);
      }

      const { error } = await supabase
        .from("company_documents")
        .delete()
        .eq("id", document.id);

      if (error) throw error;

      toast.success("Документ удалён");
      if (selectedCompanyForDetail) {
        await fetchCompanyDocuments(selectedCompanyForDetail.id);
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления документа");
    } finally {
      setIsDeletingDocument(null);
    }
  };

  const markAsPaid = async (documentId: string, companyId: string) => {
    try {
      const { error } = await supabase
        .from("company_documents")
        .update({ is_paid: true, paid_at: new Date().toISOString() })
        .eq("id", documentId);

      if (error) throw error;

      toast.success("Отмечено как оплачено");
      await fetchCompanyDocuments(companyId);
    } catch (error) {
      console.error("Error marking as paid:", error);
      toast.error("Ошибка обновления статуса");
    }
  };

  const filteredLinkStudents = linkStudents.filter(student => {
    const matchesSearch = !linkStudentSearchQuery || 
      student.full_name?.toLowerCase().includes(linkStudentSearchQuery.toLowerCase()) ||
      student.email?.toLowerCase().includes(linkStudentSearchQuery.toLowerCase());
    
    let matchesDate = true;
    if (dateFilter.from || dateFilter.to) {
      const studentDate = new Date(student.created_at);
      if (dateFilter.from && studentDate < dateFilter.from) matchesDate = false;
      if (dateFilter.to && studentDate > dateFilter.to) matchesDate = false;
    }
    
    return matchesSearch && matchesDate;
  });

  return {
    // Company detail dialog
    showCompanyDetail,
    setShowCompanyDetail,
    selectedCompanyForDetail,
    setSelectedCompanyForDetail,
    companyDocuments,
    isLoadingDocuments,
    isUploadingDocument,
    isDeletingDocument,
    openCompanyDetail,
    uploadDocument,
    deleteDocument,
    markAsPaid,
    refreshDocuments: fetchCompanyDocuments,
    
    // Link students
    linkStudents,
    filteredLinkStudents,
    isLoadingLinkStudents,
    dateFilter,
    setDateFilter,
    linkStudentSearchQuery,
    setLinkStudentSearchQuery,
    refreshLinkStudents: fetchLinkStudents,
    
    // Document preview
    showDocumentPreview,
    setShowDocumentPreview,
    previewDocumentHtml,
    setPreviewDocumentHtml,
    previewDocumentName,
    setPreviewDocumentName,
    isLoadingPreview,
    setIsLoadingPreview,
  };
}

export type { CompanyDocument, LinkStudent } from "./useCompaniesManager";
