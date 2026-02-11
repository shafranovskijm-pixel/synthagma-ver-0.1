import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Search,
  Users,
  FileText,
  Loader2,
  ChevronRight,
  Receipt,
  CheckCircle2,
  Clock,
  LayoutGrid,
  List,
} from "lucide-react";

import { useCompaniesManager, type Company } from "@/hooks/useCompaniesManager";
import { useCompanyDetailManager } from "@/hooks/useCompanyDetailManager";
import { useCompanyStudentsManager } from "@/hooks/useCompanyStudentsManager";

import {
  CompanyDetailDialog,
  CreateCompanyDialog,
  EditCompanyFormDialog,
  DeleteCompanyDialog,
  ViewStudentsDialog,
  BulkAssignStudentsDialog,
  CompanyLinksDialog,
  BulkEnrollDialog,
} from "./dialogs";

import { ContractGenerator } from "./ContractGenerator";
import { InvoiceGenerator } from "./InvoiceGenerator";
import { ActGenerator } from "./ActGenerator";

interface OrgRequisites {
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

interface CompaniesManagerProps {
  organizationId: string;
}

export function CompaniesManager({ organizationId }: CompaniesManagerProps) {
  const companiesManager = useCompaniesManager(organizationId);
  const detailManager = useCompanyDetailManager(organizationId);
  const studentsManager = useCompanyStudentsManager(organizationId);

  // View mode state
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Organization requisites for generators
  const [orgRequisites, setOrgRequisites] = useState<OrgRequisites | null>(null);

  // Links dialog state
  const [showLinksDialog, setShowLinksDialog] = useState(false);
  const [selectedCompanyForLinks, setSelectedCompanyForLinks] = useState<Company | null>(null);
  const [companyLinks, setCompanyLinks] = useState<any[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkExpiresDays, setNewLinkExpiresDays] = useState("");

  // Document generators
  const [showContractGenerator, setShowContractGenerator] = useState(false);
  const [showInvoiceGenerator, setShowInvoiceGenerator] = useState(false);
  const [showActGenerator, setShowActGenerator] = useState(false);
  const [selectedCompanyForGenerator, setSelectedCompanyForGenerator] = useState<Company | null>(null);

  // Fetch organization requisites
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
      const { error } = await supabase
        .from("registration_links")
        .delete()
        .eq("id", linkId);

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

  const handleDocumentCreated = () => {
    if (detailManager.selectedCompanyForDetail) {
      detailManager.refreshDocuments(detailManager.selectedCompanyForDetail.id);
    }
    companiesManager.fetchGlobalDocStats();
  };

  const handleUploadDocument = async (type: 'contract' | 'invoice' | 'act', file: File) => {
    if (detailManager.selectedCompanyForDetail) {
      await detailManager.uploadDocument(file, type, detailManager.selectedCompanyForDetail.id);
    }
  };

  const handleViewDocument = (doc: any) => {
    if (doc.file_url) {
      window.open(doc.file_url, "_blank");
    }
  };

  const handleDownloadDocument = (doc: any) => {
    if (doc.file_url) {
      const link = document.createElement("a");
      link.href = doc.file_url;
      link.download = doc.name;
      link.click();
    }
  };

  const handleTogglePaid = async (doc: any) => {
    if (detailManager.selectedCompanyForDetail) {
      await detailManager.markAsPaid(doc.id, detailManager.selectedCompanyForDetail.id);
    }
  };

  if (companiesManager.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            Компании
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Управление организациями-заказчиками
          </p>
        </div>
        <Button
          className="btn-gradient rounded-xl gap-2"
          onClick={() => companiesManager.setShowCreateDialog(true)}
        >
          <Plus className="w-4 h-4" />
          Добавить компанию
        </Button>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <Building2 className="w-4 h-4" />
            Компании
          </div>
          <div className="text-2xl font-bold">{companiesManager.companies.length}</div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
            <FileText className="w-4 h-4" />
            Договоры
          </div>
          <div className="text-2xl font-bold">{companiesManager.globalDocStats.contracts}</div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 text-green-500 text-sm mb-2">
            <CheckCircle2 className="w-4 h-4" />
            Оплачено
          </div>
          <div className="text-2xl font-bold text-green-500">
            {new Intl.NumberFormat('ru-RU').format(companiesManager.globalDocStats.paidAmount)} ₽
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 text-amber-500 text-sm mb-2">
            <Clock className="w-4 h-4" />
            Не оплачено
          </div>
          <div className="text-2xl font-bold text-amber-500">
            {new Intl.NumberFormat('ru-RU').format(companiesManager.globalDocStats.unpaidAmount)} ₽
          </div>
        </div>
      </div>

      {/* Search and View Toggle */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию или ИНН..."
            value={companiesManager.searchQuery}
            onChange={(e) => companiesManager.setSearchQuery(e.target.value)}
            className="pl-10 rounded-xl"
          />
        </div>
        <div className="flex rounded-xl border border-border overflow-hidden">
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-none ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-none ${viewMode === 'list' ? 'bg-primary/10 text-primary' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Companies List */}
      {companiesManager.filteredCompanies.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">
            {companiesManager.searchQuery ? "Компании не найдены" : "Нет компаний"}
          </p>
          <p className="text-sm mt-2">
            {companiesManager.searchQuery
              ? "Попробуйте изменить поисковый запрос"
              : "Добавьте первую компанию"}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {companiesManager.filteredCompanies.map((company) => (
            <button
              key={company.id}
              className="bg-card rounded-xl p-5 border border-border hover:border-primary/50 transition-all text-left group"
              onClick={() => detailManager.openCompanyDetail(company)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <h3 className="font-semibold text-lg line-clamp-1">{company.name}</h3>
              <div className="text-sm text-muted-foreground mt-1 space-y-1">
                {company.inn && <div>ИНН: {company.inn}</div>}
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {company.studentsCount} учеников
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="text-left p-4 font-medium text-sm">Название</th>
                <th className="text-left p-4 font-medium text-sm hidden md:table-cell">ИНН</th>
                <th className="text-left p-4 font-medium text-sm hidden sm:table-cell">КПП</th>
                <th className="text-left p-4 font-medium text-sm">Учеников</th>
                <th className="text-left p-4 font-medium text-sm hidden lg:table-cell">Директор</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {companiesManager.filteredCompanies.map((company) => (
                <tr
                  key={company.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer transition-colors"
                  onClick={() => detailManager.openCompanyDetail(company)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-primary" />
                      </div>
                      <span className="font-medium line-clamp-1">{company.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-muted-foreground hidden md:table-cell">
                    {company.inn || '—'}
                  </td>
                  <td className="p-4 text-muted-foreground hidden sm:table-cell">
                    {company.kpp || '—'}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="w-3 h-3" />
                      {company.studentsCount}
                    </div>
                  </td>
                  <td className="p-4 text-muted-foreground hidden lg:table-cell line-clamp-1">
                    {company.director || '—'}
                  </td>
                  <td className="p-4">
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <CompanyDetailDialog
        open={detailManager.showCompanyDetail}
        onOpenChange={detailManager.setShowCompanyDetail}
        company={detailManager.selectedCompanyForDetail}
        documents={detailManager.companyDocuments}
        isLoadingDocuments={detailManager.isLoadingDocuments}
        isUploadingDocument={detailManager.isUploadingDocument}
        isDeletingDocument={detailManager.isDeletingDocument}
        onEdit={(company) => companiesManager.openEditDialog(company)}
        onDelete={(company) => {
          companiesManager.setDeletingCompany(company);
          companiesManager.setShowDeleteConfirm(true);
        }}
        onViewStudents={(company) => studentsManager.openStudentsDialog(company)}
        onBulkAssign={(company) => studentsManager.openBulkAssignDialog(company)}
        onOpenLinks={(company) => openLinksDialog(company)}
        onBulkEnroll={(company) => studentsManager.openBulkEnrollDialog(company)}
        onOpenContractGenerator={(company) => openContractGenerator(company)}
        onOpenInvoiceGenerator={(company) => openInvoiceGenerator(company)}
        onOpenActGenerator={(company) => openActGenerator(company)}
        onUploadDocument={handleUploadDocument}
        onViewDocument={handleViewDocument}
        onDownloadDocument={handleDownloadDocument}
        onDeleteDocument={(doc) => detailManager.deleteDocument(doc)}
        onTogglePaid={handleTogglePaid}
      />

      <CreateCompanyDialog
        open={companiesManager.showCreateDialog}
        onOpenChange={companiesManager.setShowCreateDialog}
        companyName={companiesManager.newCompanyName}
        setCompanyName={companiesManager.setNewCompanyName}
        companyInn={companiesManager.newCompanyInn}
        setCompanyInn={companiesManager.setNewCompanyInn}
        companyEmail={companiesManager.newCompanyEmail}
        setCompanyEmail={companiesManager.setNewCompanyEmail}
        isCreating={companiesManager.isCreating}
        isSearchingDadata={companiesManager.isSearchingDadata}
        dadataCompanyInfo={companiesManager.dadataCompanyInfo}
        onSearchByInn={companiesManager.searchDadata}
        onCreate={companiesManager.createCompany}
        onClose={() => {
          companiesManager.setNewCompanyName("");
          companiesManager.setNewCompanyInn("");
          companiesManager.setNewCompanyEmail("");
          companiesManager.setDadataCompanyInfo(null);
        }}
      />

      <EditCompanyFormDialog
        open={companiesManager.showEditDialog}
        onOpenChange={companiesManager.setShowEditDialog}
        company={companiesManager.editingCompany}
        companyName={companiesManager.editCompanyName}
        setCompanyName={companiesManager.setEditCompanyName}
        companyInn={companiesManager.editCompanyInn}
        setCompanyInn={companiesManager.setEditCompanyInn}
        companyEmail={companiesManager.editCompanyEmail}
        setCompanyEmail={companiesManager.setEditCompanyEmail}
        isSaving={companiesManager.isSaving}
        isSearchingDadata={companiesManager.isSearchingDadataEdit}
        dadataCompanyInfo={companiesManager.dadataEditCompanyInfo}
        onSearchByInn={(inn) => {
          companiesManager.searchDadata(inn);
        }}
        onSave={companiesManager.saveCompany}
        onClose={() => {
          companiesManager.setDadataEditCompanyInfo(null);
        }}
      />

      <DeleteCompanyDialog
        open={companiesManager.showDeleteConfirm}
        onOpenChange={companiesManager.setShowDeleteConfirm}
        company={companiesManager.deletingCompany}
        isDeleting={companiesManager.isDeleting}
        onDelete={companiesManager.deleteCompany}
      />

      <ViewStudentsDialog
        open={studentsManager.showStudentsDialog}
        onOpenChange={studentsManager.setShowStudentsDialog}
        company={studentsManager.selectedCompanyForStudents}
        students={studentsManager.filteredCompanyStudents}
        isLoading={studentsManager.isLoadingStudents}
        searchQuery={studentsManager.studentSearchQuery}
        setSearchQuery={studentsManager.setStudentSearchQuery}
      />

      <BulkAssignStudentsDialog
        open={studentsManager.showBulkAssignDialog}
        onOpenChange={studentsManager.setShowBulkAssignDialog}
        company={studentsManager.selectedCompanyForAssign}
        availableStudents={studentsManager.filteredAvailableStudents}
        selectedStudentIds={studentsManager.selectedStudentIds}
        isLoading={studentsManager.isLoadingAvailableStudents}
        isAssigning={studentsManager.isAssigning}
        searchQuery={studentsManager.assignSearchQuery}
        setSearchQuery={studentsManager.setAssignSearchQuery}
        showOnlyUnassigned={studentsManager.showOnlyUnassigned}
        setShowOnlyUnassigned={studentsManager.setShowOnlyUnassigned}
        onToggleStudent={studentsManager.toggleStudentSelection}
        onToggleSelectAll={studentsManager.toggleSelectAll}
        onAssign={async () => {
          await studentsManager.assignStudentsToCompany();
          companiesManager.refreshCompanies();
        }}
      />

      <CompanyLinksDialog
        open={showLinksDialog}
        onOpenChange={setShowLinksDialog}
        company={selectedCompanyForLinks}
        links={companyLinks}
        isLoading={isLoadingLinks}
        isCreating={isCreatingLink}
        newLinkName={newLinkName}
        setNewLinkName={setNewLinkName}
        newLinkExpiresDays={newLinkExpiresDays}
        setNewLinkExpiresDays={setNewLinkExpiresDays}
        onCreateLink={createLink}
        onDeleteLink={deleteLink}
      />

      <BulkEnrollDialog
        open={studentsManager.showBulkEnrollDialog}
        onOpenChange={studentsManager.setShowBulkEnrollDialog}
        company={studentsManager.selectedCompanyForEnroll}
        courses={studentsManager.availableCourses}
        selectedCourseIds={studentsManager.selectedCourseIds}
        isLoading={studentsManager.isLoadingCourses}
        isEnrolling={studentsManager.isEnrolling}
        onToggleCourse={studentsManager.toggleCourseSelection}
        onEnroll={studentsManager.enrollCompanyToCourses}
      />

      {/* Document Generators */}
      {orgRequisites && (
        <>
          <ContractGenerator
            organizationId={organizationId}
            isOpen={showContractGenerator}
            onClose={() => {
              setShowContractGenerator(false);
              setSelectedCompanyForGenerator(null);
            }}
            orgRequisites={orgRequisites}
            preselectedCompany={selectedCompanyForGenerator}
          />

          <InvoiceGenerator
            organizationId={organizationId}
            isOpen={showInvoiceGenerator}
            onClose={() => {
              setShowInvoiceGenerator(false);
              setSelectedCompanyForGenerator(null);
            }}
            orgRequisites={orgRequisites}
            preselectedCompany={selectedCompanyForGenerator}
          />

          <ActGenerator
            organizationId={organizationId}
            isOpen={showActGenerator}
            onClose={() => {
              setShowActGenerator(false);
              setSelectedCompanyForGenerator(null);
            }}
            orgRequisites={orgRequisites}
            preselectedCompany={selectedCompanyForGenerator}
          />
        </>
      )}
    </div>
  );
}
