import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Building2, Plus, Search, Users, FileText, Loader2,
  ChevronRight, CheckCircle2, Clock, LayoutGrid, List,
  CreditCard, Upload, RefreshCw, ExternalLink,
} from "lucide-react";

import { useCompaniesManager } from "@/hooks/useCompaniesManager";
import { useCompanyDetailManager } from "@/hooks/useCompanyDetailManager";
import { useCompanyStudentsManager } from "@/hooks/useCompanyStudentsManager";
import { useCompanyLinksAndGenerators } from "@/hooks/useCompanyLinksAndGenerators";

import {
  CompanyDetailDialog, CreateCompanyDialog, EditCompanyFormDialog,
  DeleteCompanyDialog, ViewStudentsDialog, BulkAssignStudentsDialog,
  CompanyLinksDialog, BulkEnrollDialog,
} from "./dialogs";

import { ContractGenerator } from "./ContractGenerator";
import { InvoiceGenerator } from "./InvoiceGenerator";
import { ActGenerator } from "./ActGenerator";

interface CompaniesManagerProps {
  organizationId: string;
}

const StatsGrid = ({ cm }: { cm: any }) => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><Building2 className="w-4 h-4" />Компании</div>
      <div className="text-2xl font-bold">{cm.companies.length}</div>
    </div>
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2"><FileText className="w-4 h-4" />Договоры</div>
      <div className="text-2xl font-bold">{cm.globalDocStats.contracts}</div>
    </div>
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center gap-2 text-green-500 text-sm mb-2"><CheckCircle2 className="w-4 h-4" />Оплачено</div>
      <div className="text-2xl font-bold text-green-500">{new Intl.NumberFormat('ru-RU').format(cm.globalDocStats.paidAmount)} ₽</div>
    </div>
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center gap-2 text-amber-500 text-sm mb-2"><Clock className="w-4 h-4" />Не оплачено</div>
      <div className="text-2xl font-bold text-amber-500">{new Intl.NumberFormat('ru-RU').format(cm.globalDocStats.unpaidAmount)} ₽</div>
    </div>
  </div>
);

export function CompaniesManager({ organizationId }: CompaniesManagerProps) {
  const navigate = useNavigate();
  const cm = useCompaniesManager(organizationId);
  const dm = useCompanyDetailManager(organizationId);
  const sm = useCompanyStudentsManager(organizationId);
  const lg = useCompanyLinksAndGenerators(organizationId);

  const handleViewAsCompany = (e: React.MouseEvent, companyId: string) => {
    e.stopPropagation();
    localStorage.setItem('orgViewAsCompany', companyId);
    navigate('/company');
  };

  const handleDocumentCreated = () => {
    if (dm.selectedCompanyForDetail) dm.refreshDocuments(dm.selectedCompanyForDetail.id);
    cm.fetchGlobalDocStats();
  };

  const handleUploadDocument = async (type: 'contract' | 'invoice' | 'act', file: File) => {
    if (dm.selectedCompanyForDetail) await dm.uploadDocument(file, type, dm.selectedCompanyForDetail.id);
  };

  const handleViewDocument = (doc: any) => { if (doc.file_url) window.open(doc.file_url, "_blank"); };
  const handleDownloadDocument = (doc: any) => {
    if (doc.file_url) { const a = document.createElement("a"); a.href = doc.file_url; a.download = doc.name; a.click(); }
  };
  const handleTogglePaid = async (doc: any) => {
    if (dm.selectedCompanyForDetail) await dm.markAsPaid(doc.id, dm.selectedCompanyForDetail.id);
  };

  if (cm.isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />Компании
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Управление организациями-заказчиками</p>
        </div>
        <Button className="btn-gradient rounded-xl gap-2" onClick={() => cm.setShowCreateDialog(true)}>
          <Plus className="w-4 h-4" />Добавить компанию
        </Button>
      </div>

      {/* Search and View Toggle */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Поиск по названию или ИНН..." value={cm.searchQuery} onChange={(e) => cm.setSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
        </div>
        <div className="flex rounded-xl border border-border overflow-hidden">
          <Button variant="ghost" size="icon" className={`rounded-none ${lg.viewMode === 'grid' ? 'bg-primary/10 text-primary' : ''}`} onClick={() => lg.setViewMode('grid')}><LayoutGrid className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className={`rounded-none ${lg.viewMode === 'list' ? 'bg-primary/10 text-primary' : ''}`} onClick={() => lg.setViewMode('list')}><List className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Companies List */}
      {cm.filteredCompanies.length === 0 ? (
        cm.searchQuery ? (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Компании не найдены</p>
            <p className="text-sm mt-2">Попробуйте изменить поисковый запрос</p>
          </div>
        ) : (
          <>
            {/* Onboarding card first */}
            <Card className="overflow-hidden border-0 shadow-lg">
              <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Начните работу с корпоративными клиентами</h2>
                    <p className="text-muted-foreground">Управляйте компаниями-заказчиками в одном месте</p>
                  </div>
                </div>
              </div>
              <CardContent className="p-8 pt-6">
                <div className="grid sm:grid-cols-2 gap-4 mb-8">
                  {[
                    { icon: FileText, title: "База заказчиков", desc: "Ведите реестр компаний с реквизитами, ИНН, КПП и адресами — данные подтягиваются автоматически" },
                    { icon: FileText, title: "Договоры, счета и акты", desc: "Автоматическое формирование документов по шаблонам с реквизитами компании" },
                    { icon: CreditCard, title: "Контроль оплат", desc: "Отслеживание оплат и задолженностей в реальном времени с наглядной аналитикой" },
                    { icon: Users, title: "Личный кабинет компании", desc: "Каждая компания получает свой кабинет с доступом к обучению сотрудников" },
                    { icon: Upload, title: "Массовое зачисление", desc: "Загружайте списки сотрудников из Excel и зачисляйте на курсы в один клик" },
                    { icon: RefreshCw, title: "Контроль переобучения", desc: "Планы обучения и автоматические напоминания о сроках переаттестации" },
                  ].map((feature, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <feature.icon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{feature.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{feature.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button size="lg" className="w-full sm:w-auto" onClick={() => cm.setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Добавить первую компанию
                </Button>
              </CardContent>
            </Card>

            {/* Stats below onboarding */}
            <StatsGrid cm={cm} />
          </>
        )
      ) : (
        <>
          {/* Stats above company list */}
          <StatsGrid cm={cm} />

          {lg.viewMode === 'grid' ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {cm.filteredCompanies.map((company) => (
                <button key={company.id} className="bg-card rounded-xl p-5 border border-border hover:border-primary/50 transition-all text-left group" onClick={() => dm.openCompanyDetail(company)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 className="w-6 h-6 text-primary" /></div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" title="Войти как компания" onClick={(e) => handleViewAsCompany(e, company.id)}>
                        <ExternalLink className="w-4 h-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-lg line-clamp-1">{company.name}</h3>
                  <div className="text-sm text-muted-foreground mt-1 space-y-1">
                    {company.inn && <div>ИНН: {company.inn}</div>}
                    <div className="flex items-center gap-1"><Users className="w-3 h-3" />{company.studentsCount} учеников</div>
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
                  {cm.filteredCompanies.map((company) => (
                    <tr key={company.id} className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer transition-colors" onClick={() => dm.openCompanyDetail(company)}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Building2 className="w-4 h-4 text-primary" /></div>
                          <span className="font-medium line-clamp-1">{company.name}</span>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground hidden md:table-cell">{company.inn || '—'}</td>
                      <td className="p-4 text-muted-foreground hidden sm:table-cell">{company.kpp || '—'}</td>
                      <td className="p-4"><div className="flex items-center gap-1 text-muted-foreground"><Users className="w-3 h-3" />{company.studentsCount}</div></td>
                      <td className="p-4 text-muted-foreground hidden lg:table-cell line-clamp-1">{company.director || '—'}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="Войти как компания" onClick={(e) => handleViewAsCompany(e, company.id)}>
                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                          </Button>
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <CompanyDetailDialog
        open={dm.showCompanyDetail} onOpenChange={dm.setShowCompanyDetail}
        company={dm.selectedCompanyForDetail} documents={dm.companyDocuments}
        isLoadingDocuments={dm.isLoadingDocuments} isUploadingDocument={dm.isUploadingDocument}
        isDeletingDocument={dm.isDeletingDocument}
        onEdit={(c) => cm.openEditDialog(c)}
        onDelete={(c) => { cm.setDeletingCompany(c); cm.setShowDeleteConfirm(true); }}
        onViewStudents={(c) => sm.openStudentsDialog(c)}
        onBulkAssign={(c) => sm.openBulkAssignDialog(c)}
        onOpenLinks={(c) => lg.openLinksDialog(c)}
        onBulkEnroll={(c) => sm.openBulkEnrollDialog(c)}
        onOpenContractGenerator={(c) => lg.openContractGenerator(c)}
        onOpenInvoiceGenerator={(c) => lg.openInvoiceGenerator(c)}
        onOpenActGenerator={(c) => lg.openActGenerator(c)}
        onUploadDocument={handleUploadDocument}
        onViewDocument={handleViewDocument} onDownloadDocument={handleDownloadDocument}
        onDeleteDocument={(doc) => dm.deleteDocument(doc)} onTogglePaid={handleTogglePaid}
      />

      <CreateCompanyDialog
        open={cm.showCreateDialog} onOpenChange={cm.setShowCreateDialog}
        companyName={cm.newCompanyName} setCompanyName={cm.setNewCompanyName}
        companyInn={cm.newCompanyInn} setCompanyInn={cm.setNewCompanyInn}
        companyEmail={cm.newCompanyEmail} setCompanyEmail={cm.setNewCompanyEmail}
        isCreating={cm.isCreating} isSearchingDadata={cm.isSearchingDadata}
        dadataCompanyInfo={cm.dadataCompanyInfo} onSearchByInn={cm.searchDadata}
        onCreate={cm.createCompany}
        onClose={() => { cm.setNewCompanyName(""); cm.setNewCompanyInn(""); cm.setNewCompanyEmail(""); cm.setDadataCompanyInfo(null); }}
      />

      <EditCompanyFormDialog
        open={cm.showEditDialog} onOpenChange={cm.setShowEditDialog}
        company={cm.editingCompany} companyName={cm.editCompanyName} setCompanyName={cm.setEditCompanyName}
        companyInn={cm.editCompanyInn} setCompanyInn={cm.setEditCompanyInn}
        companyEmail={cm.editCompanyEmail} setCompanyEmail={cm.setEditCompanyEmail}
        isSaving={cm.isSaving} isSearchingDadata={cm.isSearchingDadataEdit}
        dadataCompanyInfo={cm.dadataEditCompanyInfo} onSearchByInn={(inn) => cm.searchDadata(inn)}
        onSave={cm.saveCompany} onClose={() => cm.setDadataEditCompanyInfo(null)}
      />

      <DeleteCompanyDialog open={cm.showDeleteConfirm} onOpenChange={cm.setShowDeleteConfirm} company={cm.deletingCompany} isDeleting={cm.isDeleting} onDelete={cm.deleteCompany} />

      <ViewStudentsDialog open={sm.showStudentsDialog} onOpenChange={sm.setShowStudentsDialog} company={sm.selectedCompanyForStudents} students={sm.filteredCompanyStudents} isLoading={sm.isLoadingStudents} searchQuery={sm.studentSearchQuery} setSearchQuery={sm.setStudentSearchQuery} />

      <BulkAssignStudentsDialog
        open={sm.showBulkAssignDialog} onOpenChange={sm.setShowBulkAssignDialog}
        company={sm.selectedCompanyForAssign} availableStudents={sm.filteredAvailableStudents}
        selectedStudentIds={sm.selectedStudentIds} isLoading={sm.isLoadingAvailableStudents}
        isAssigning={sm.isAssigning} searchQuery={sm.assignSearchQuery} setSearchQuery={sm.setAssignSearchQuery}
        showOnlyUnassigned={sm.showOnlyUnassigned} setShowOnlyUnassigned={sm.setShowOnlyUnassigned}
        onToggleStudent={sm.toggleStudentSelection} onToggleSelectAll={sm.toggleSelectAll}
        onAssign={async () => { await sm.assignStudentsToCompany(); cm.refreshCompanies(); }}
      />

      <CompanyLinksDialog
        open={lg.showLinksDialog} onOpenChange={lg.setShowLinksDialog}
        company={lg.selectedCompanyForLinks} links={lg.companyLinks}
        isLoading={lg.isLoadingLinks} isCreating={lg.isCreatingLink}
        newLinkName={lg.newLinkName} setNewLinkName={lg.setNewLinkName}
        newLinkExpiresDays={lg.newLinkExpiresDays} setNewLinkExpiresDays={lg.setNewLinkExpiresDays}
        onCreateLink={lg.createLink} onDeleteLink={lg.deleteLink}
      />

      <BulkEnrollDialog
        open={sm.showBulkEnrollDialog} onOpenChange={sm.setShowBulkEnrollDialog}
        company={sm.selectedCompanyForEnroll} courses={sm.availableCourses}
        selectedCourseIds={sm.selectedCourseIds} isLoading={sm.isLoadingCourses}
        isEnrolling={sm.isEnrolling} onToggleCourse={sm.toggleCourseSelection}
        onEnroll={sm.enrollCompanyToCourses} categories={lg.categories} getCategoryById={lg.getCategoryById}
      />

      {/* Document Generators */}
      {lg.orgRequisites && (
        <>
          <ContractGenerator organizationId={organizationId} isOpen={lg.showContractGenerator} onClose={lg.closeContractGenerator} orgRequisites={lg.orgRequisites} preselectedCompany={lg.selectedCompanyForGenerator} />
          <InvoiceGenerator organizationId={organizationId} isOpen={lg.showInvoiceGenerator} onClose={lg.closeInvoiceGenerator} orgRequisites={lg.orgRequisites} preselectedCompany={lg.selectedCompanyForGenerator} />
          <ActGenerator organizationId={organizationId} isOpen={lg.showActGenerator} onClose={lg.closeActGenerator} orgRequisites={lg.orgRequisites} preselectedCompany={lg.selectedCompanyForGenerator} />
        </>
      )}
    </div>
  );
}
