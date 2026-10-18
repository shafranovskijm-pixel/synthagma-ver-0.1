import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Company, CompanyDocument, LinkStudent } from "./useCompaniesManager";

export function useCompanyDetailManager(organizationId: string) {
  const detailLoadSequenceRef = useRef(0);
  const activeCompanyIdRef = useRef<string | null>(null);

  const isCurrentDetailLoad = useCallback((companyId: string, sequence: number) => (
    activeCompanyIdRef.current === companyId
    && detailLoadSequenceRef.current === sequence
  ), []);

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

  const fetchLinkStudents = useCallback(async (
    companyId: string,
    sequence = detailLoadSequenceRef.current,
  ) => {
    if (activeCompanyIdRef.current !== companyId) return;
    setIsLoadingLinkStudents(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, email, login, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (isCurrentDetailLoad(companyId, sequence)) {
        setLinkStudents((data || []) as LinkStudent[]);
      }
    } catch (error) {
      console.error("Error fetching link students:", error);
    } finally {
      if (isCurrentDetailLoad(companyId, sequence)) {
        setIsLoadingLinkStudents(false);
      }
    }
  }, [isCurrentDetailLoad]);

  const fetchCompanyDocuments = useCallback(async (
    companyId: string,
    sequence = detailLoadSequenceRef.current,
  ) => {
    if (activeCompanyIdRef.current !== companyId) return;
    setIsLoadingDocuments(true);
    try {
      const { data, error } = await supabase
        .from("company_documents")
        .select("*")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      if (isCurrentDetailLoad(companyId, sequence)) {
        setCompanyDocuments((data || []) as CompanyDocument[]);
      }
    } catch (error) {
      console.error("Error fetching company documents:", error);
    } finally {
      if (isCurrentDetailLoad(companyId, sequence)) {
        setIsLoadingDocuments(false);
      }
    }
  }, [isCurrentDetailLoad]);

  const openCompanyDetail = useCallback(async (company: Company) => {
    const sequence = detailLoadSequenceRef.current + 1;
    detailLoadSequenceRef.current = sequence;
    activeCompanyIdRef.current = company.id;
    setSelectedCompanyForDetail(company);
    setShowCompanyDetail(true);
    setCompanyDocuments([]);
    setLinkStudents([]);
    setDateFilter({ from: undefined, to: undefined });
    setLinkStudentSearchQuery("");
    await Promise.all([
      fetchCompanyDocuments(company.id, sequence),
      fetchLinkStudents(company.id, sequence)
    ]);
  }, [fetchCompanyDocuments, fetchLinkStudents]);

  const uploadDocument = async (file: File, type: 'contract' | 'invoice' | 'act' | 'other', companyId: string) => {
    setIsUploadingDocument(type);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
      const fileExt = /^[a-z0-9]{1,12}$/.test(extension) ? extension : "bin";
      const filePath = `${companyId}/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("company-documents")
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("company_documents")
        .insert({
          company_id: companyId,
          type,
          name: file.name,
          file_url: null,
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
      const { error } = await supabase.rpc("soft_delete_document", {
        p_table: "company_documents", p_id: document.id,
      });

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
