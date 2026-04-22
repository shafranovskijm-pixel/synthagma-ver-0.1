import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  FileText, Download, Trash2, Upload, Search, Eye,
  Building2, Scale, Award, ClipboardList, FileCheck, Users, GraduationCap,
  CheckCircle2, AlertCircle, FolderOpen, Sparkles, CheckCircle, ShoppingCart, Check,
  Archive, Clock, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { OrdersArchive } from "./OrdersArchive";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SelfExaminationQuiz } from "./SelfExaminationQuiz";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import {
  useOrgDocumentsManager, REGULAR_CATEGORIES, SPECIAL_CATEGORIES, ALL_CATEGORIES, getAllDocumentTypes,
} from "@/hooks/useOrgDocumentsManager";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Building2, Scale, Award, ClipboardList, FileCheck, FileText, Users, GraduationCap,
};

interface OrgDocumentsManagerProps {
  organizationId: string;
}

export function OrgDocumentsManager({ organizationId }: OrgDocumentsManagerProps) {
  const h = useOrgDocumentsManager(organizationId);

  if (h.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SigmaSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!h.activeCategory ? (
        <OverviewContent h={h} />
      ) : (
        <SpecialCategoryContent h={h} />
      )}

      {/* Upload Dialog */}
      <Dialog open={h.showUploadDialog} onOpenChange={h.setShowUploadDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Загрузить документ</DialogTitle>
            <DialogDescription>
              {getAllDocumentTypes().find((t) => t.value === h.uploadDocType)?.label}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Файл документа</Label>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
                <input type="file" id="file-upload" className="hidden" onChange={h.handleFileSelect} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {h.selectedFile ? (
                    <div className="flex items-center justify-center gap-2 text-primary">
                      <FileText className="w-5 h-5" />
                      <span className="font-medium">{h.selectedFile.name}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                      <div className="text-sm text-muted-foreground">Нажмите для выбора файла</div>
                      <div className="text-xs text-muted-foreground">PDF, DOC, DOCX, XLS, XLSX, JPG, PNG</div>
                    </div>
                  )}
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Дата выдачи</Label>
                <Input type="date" value={h.uploadIssueDate} onChange={(e) => h.setUploadIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Срок действия до</Label>
                <Input type="date" value={h.uploadExpiresAt} onChange={(e) => h.setUploadExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ответственное лицо</Label>
              <Input
                placeholder="ФИО ответственного"
                value={h.uploadResponsible}
                onChange={(e) => h.setUploadResponsible(e.target.value)}
              />
            </div>
            <Button className="w-full btn-gradient rounded-xl" onClick={h.handleUpload} disabled={h.isUploading || !h.selectedFile}>
              {h.isUploading ? (<><SigmaSpinner size="sm" className="mr-2" />Загрузка...</>) : (<><Upload className="w-4 h-4 mr-2" />Загрузить</>)}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <SelfExaminationQuiz open={h.showQuiz} onOpenChange={h.setShowQuiz} onSubmit={h.handleQuizSubmit} isSubmitting={h.isSubmittingQuiz} organizationData={h.organizationData} />

      <Dialog open={h.showAutoGenSuccessDialog} onOpenChange={h.setShowAutoGenSuccessDialog}>
        <DialogContent className="rounded-2xl text-center">
          <div className="py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <DialogTitle className="font-display text-xl mb-2">Заявка отправлена!</DialogTitle>
            <DialogDescription className="text-base">Мы получили вашу заявку на формирование отчёта о результатах самообследования и свяжемся с вами в ближайшее время.</DialogDescription>
            <Button className="mt-6 btn-gradient rounded-xl" onClick={() => h.setShowAutoGenSuccessDialog(false)}>Отлично</Button>
          </div>
        </DialogContent>
      </Dialog>

      <OrderDocumentsDialog h={h} />
    </div>
  );
}

function OverviewContent({ h }: { h: ReturnType<typeof useOrgDocumentsManager> }) {
  return (
    <div className="space-y-6">
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Комплектность документов</h3>
              <p className="text-sm text-muted-foreground">Обязательные документы для ДПО и ПО по 273-ФЗ</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">{h.completionPercent}%</div>
            <div className="text-sm text-muted-foreground">{h.uploadedRequired} из {h.totalRequired} обязательных</div>
          </div>
        </div>
        <Progress value={h.completionPercent} className="h-2" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Поиск документов..." value={h.searchQuery} onChange={(e) => h.setSearchQuery(e.target.value)} className="pl-10 rounded-xl" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["all", "active", "expiring", "expired", "archived"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={h.expiryFilter === f ? "default" : "outline"}
              className="rounded-xl"
              onClick={() => h.setExpiryFilter(f)}
            >
              {f === "all" ? "Все" : f === "active" ? "Действующие" : f === "expiring" ? "Истекают" : f === "expired" ? "Просрочены" : "Архив"}
            </Button>
          ))}
        </div>
        <Button variant="outline" className="rounded-xl gap-2" onClick={() => h.setShowOrderDialog(true)}>
          <ShoppingCart className="w-4 h-4" />
          Заказать документы
        </Button>
      </div>

      <Accordion type="multiple" className="space-y-4">
        {REGULAR_CATEGORIES.map((category) => {
          const CategoryIcon = ICON_MAP[category.icon] || FileText;
          const categoryDocs = category.documents;
          const uploadedCount = categoryDocs.filter((d) => h.getDocumentForType(d.type)).length;
          const requiredCount = categoryDocs.filter((d) => d.required).length;
          const uploadedRequiredCount = categoryDocs.filter((d) => d.required && h.getDocumentForType(d.type)).length;
          const filteredDocs = h.searchQuery ? categoryDocs.filter((doc) => doc.label.toLowerCase().includes(h.searchQuery.toLowerCase())) : categoryDocs;
          if (h.searchQuery && filteredDocs.length === 0) return null;

          const annualDocs = categoryDocs.filter((d: any) => d.annual);
          const hasAnnualReminder = annualDocs.some((d: any) => {
            const uploadedDoc = h.getDocumentForType(d.type);
            if (!uploadedDoc) return true;
            const daysSince = Math.floor((Date.now() - new Date(uploadedDoc.updated_at).getTime()) / (1000 * 60 * 60 * 24));
            return daysSince >= 365;
          });

          return (
            <AccordionItem key={category.id} value={category.id} className="bg-card rounded-2xl border border-border overflow-hidden">
              <AccordionTrigger className="px-4 py-3 hover:no-underline [&[data-state=open]>svg]:rotate-180">
                <div className="flex items-center justify-between w-full pr-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${category.bgColor} flex items-center justify-center`}>
                      <CategoryIcon className={`w-5 h-5 ${category.color}`} />
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{category.title}</h3>
                        {hasAnnualReminder && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />Требуется обновление
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {uploadedCount} из {categoryDocs.length} загружено
                        {requiredCount > 0 && <span className="ml-2">(обязательных: {uploadedRequiredCount}/{requiredCount})</span>}
                      </p>
                    </div>
                  </div>
                  {uploadedRequiredCount === requiredCount && requiredCount > 0 && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                <div className="divide-y divide-border border-t border-border">
                  {(h.searchQuery ? filteredDocs : categoryDocs).map((docItem: any) => (
                    <DocumentRow key={docItem.type} docItem={docItem} h={h} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

function DocumentRow({ docItem, h }: { docItem: any; h: ReturnType<typeof useOrgDocumentsManager> }) {
  const uploadedDoc = h.getDocumentForType(docItem.type);
  const hasFile = !!uploadedDoc?.file_url;
  const isAnnual = docItem.annual;
  const exp = h.getExpiryStatus(uploadedDoc);
  let annualStatus: { needsUpdate: boolean; daysSince: number | null; daysUntil: number | null } | null = null;
  if (isAnnual && uploadedDoc) {
    const daysSince = Math.floor((Date.now() - new Date(uploadedDoc.updated_at).getTime()) / (1000 * 60 * 60 * 24));
    const daysUntil = 365 - daysSince;
    annualStatus = { needsUpdate: daysSince >= 365, daysSince, daysUntil: daysUntil > 0 ? daysUntil : 0 };
  }

  // Apply expiry filter — hide rows that don't match
  if (h.expiryFilter !== "all" && uploadedDoc) {
    if (h.expiryFilter === "active" && exp.state !== "active") return null;
    if (h.expiryFilter === "expiring" && exp.state !== "expiring") return null;
    if (h.expiryFilter === "expired" && exp.state !== "expired") return null;
    if (h.expiryFilter === "archived" && exp.state !== "archived") return null;
  } else if (h.expiryFilter !== "all" && !uploadedDoc) {
    return null;
  }

  const expBadge = (() => {
    if (!uploadedDoc) return null;
    if (exp.state === "archived") return <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0"><Archive className="w-3 h-3" />Архив</span>;
    if (exp.state === "expired") return <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive flex-shrink-0"><AlertTriangle className="w-3 h-3" />Просрочен</span>;
    if (exp.state === "expiring") return <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 flex-shrink-0"><Clock className="w-3 h-3" />Истекает через {exp.daysLeft} дн.</span>;
    if (uploadedDoc.expires_at) return <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 flex-shrink-0"><Check className="w-3 h-3" />Действует</span>;
    return null;
  })();

  return (
    <div className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${hasFile ? (annualStatus?.needsUpdate || exp.state === "expired" ? "bg-amber-500/10" : "bg-green-500/10") : docItem.required ? "bg-destructive/10" : "bg-secondary"}`}>
          {hasFile ? (annualStatus?.needsUpdate || exp.state === "expired" ? <AlertCircle className="w-4 h-4 text-amber-500" /> : <CheckCircle2 className="w-4 h-4 text-green-500" />) : docItem.required ? <AlertCircle className="w-4 h-4 text-destructive" /> : <FileText className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{docItem.label}</span>
            {docItem.required && <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive flex-shrink-0">Обязательный</span>}
            {isAnnual && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 flex-shrink-0">Ежегодный</span>}
            {expBadge}
          </div>
          {uploadedDoc && (
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span>Загружен {format(new Date(uploadedDoc.updated_at), "d MMMM yyyy", { locale: ru })}</span>
              {uploadedDoc.issue_date && <span>· Выдан {format(new Date(uploadedDoc.issue_date), "d MMM yyyy", { locale: ru })}</span>}
              {uploadedDoc.expires_at && <span>· До {format(new Date(uploadedDoc.expires_at), "d MMM yyyy", { locale: ru })}</span>}
              {uploadedDoc.responsible_person && <span>· Отв.: {uploadedDoc.responsible_person}</span>}
              {annualStatus && !annualStatus.needsUpdate && annualStatus.daysUntil !== null && <span className="text-blue-600">(до обновления: {annualStatus.daysUntil} дн.)</span>}
              {annualStatus?.needsUpdate && <span className="text-amber-600 font-medium">⚠️ Требуется обновление (прошло {annualStatus.daysSince} дн.)</span>}
            </div>
          )}
          {isAnnual && !uploadedDoc && <div className="text-xs text-amber-600 mt-0.5">⚠️ Отчёт не загружен — необходимо загрузить ежегодно</div>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        {hasFile && uploadedDoc && (
          <>
            <Button variant="ghost" size="icon" onClick={() => window.open(uploadedDoc.file_url!, "_blank")} title="Просмотр"><Eye className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => { const link = document.createElement("a"); link.href = uploadedDoc.file_url!; link.download = docItem.label; link.click(); }} title="Скачать"><Download className="w-4 h-4" /></Button>
            {uploadedDoc.status === "archived" ? (
              <Button variant="ghost" size="icon" onClick={() => h.restoreDocument(uploadedDoc.id)} title="Восстановить"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></Button>
            ) : (
              <Button variant="ghost" size="icon" onClick={() => h.archiveDocument(uploadedDoc.id)} title="В архив"><FolderOpen className="w-4 h-4" /></Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => h.handleDelete(uploadedDoc.id)} className="text-destructive hover:text-destructive" title="Удалить"><Trash2 className="w-4 h-4" /></Button>
          </>
        )}
        {docItem.type === "self_examination_report" && (
          <Button variant="outline" size="sm" onClick={() => h.setShowQuiz(true)} className="rounded-lg border-primary/50 text-primary hover:bg-primary/10" title="Заказать автоформирование отчёта">
            <Sparkles className="w-4 h-4 mr-2" />Сформировать за 3 500 ₽
          </Button>
        )}
        <Button variant={hasFile ? (annualStatus?.needsUpdate || exp.state === "expired" ? "default" : "outline") : "default"} size="sm" onClick={() => h.openUploadDialog(docItem.type)} className={cn("rounded-lg", (annualStatus?.needsUpdate || exp.state === "expired") && "bg-amber-500 hover:bg-amber-600")}>
          <Upload className="w-4 h-4 mr-2" />{(annualStatus?.needsUpdate || exp.state === "expired") ? "Обновить" : hasFile ? "Заменить" : "Загрузить"}
        </Button>
      </div>
    </div>
  );
}

function SpecialCategoryContent({ h }: { h: ReturnType<typeof useOrgDocumentsManager> }) {
  const category = SPECIAL_CATEGORIES.find((c) => c.id === h.activeCategory);
  if (!category) return null;
  const CategoryIcon = ICON_MAP[category.icon] || FileText;
  const categoryDocs = h.getDocumentsForCategory(category.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-12 h-12 rounded-xl ${category.bgColor} flex items-center justify-center`}>
          <CategoryIcon className={`w-6 h-6 ${category.color}`} />
        </div>
        <div>
          <h2 className="text-xl font-bold">{category.title}</h2>
          <p className="text-sm text-muted-foreground">{categoryDocs.length} документов</p>
        </div>
      </div>

      {h.activeCategory === "enrollment_orders" ? (
        <OrdersArchive documents={h.documents} onDelete={h.handleDelete} onView={(url) => window.open(url, "_blank")} />
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          {categoryDocs.length === 0 ? (
            <div className="p-12 text-center">
              <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold mb-2">Нет документов</h3>
              <p className="text-sm text-muted-foreground mb-4">В этой категории пока нет загруженных документов</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {categoryDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate block">{doc.name}</span>
                      <div className="text-xs text-muted-foreground mt-0.5">{format(new Date(doc.created_at), "d MMMM yyyy, HH:mm", { locale: ru })}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {doc.file_url && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => window.open(doc.file_url!, "_blank")} title="Просмотр"><Eye className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { const link = document.createElement("a"); link.href = doc.file_url!; link.download = doc.name; link.click(); }} title="Скачать"><Download className="w-4 h-4" /></Button>
                      </>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => h.handleDelete(doc.id)} className="text-destructive hover:text-destructive" title="Удалить"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderDocumentsDialog({ h }: { h: ReturnType<typeof useOrgDocumentsManager> }) {
  return (
    <Dialog open={h.showOrderDialog} onOpenChange={h.setShowOrderDialog}>
      <DialogContent className="rounded-2xl max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Заказать документы</DialogTitle>
          <DialogDescription>Выберите документы, которые нужно изготовить. Мы свяжемся с вами для уточнения деталей.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 min-h-[200px] max-h-[60vh] pr-4">
          <div className="space-y-4">
            {REGULAR_CATEGORIES.map((category) => {
              const CategoryIcon = ICON_MAP[category.icon] || FileText;
              return (
                <div key={category.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg ${category.bgColor} flex items-center justify-center`}>
                      <CategoryIcon className={`w-4 h-4 ${category.color}`} />
                    </div>
                    <h4 className="font-medium text-sm">{category.title}</h4>
                  </div>
                  <div className="ml-10 space-y-1">
                    {category.documents.map((doc) => {
                      const isSelected = h.selectedDocsForOrder.includes(doc.type);
                      const isUploaded = !!h.getDocumentForType(doc.type);
                      return (
                        <div key={doc.type} onClick={() => h.toggleDocForOrder(doc.type)} className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border", isSelected ? "bg-primary/10 border-primary" : "bg-secondary/30 border-transparent hover:bg-secondary/50")}>
                          <div className={cn("w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors", isSelected ? "bg-primary border-primary" : "border-muted-foreground/30")}>
                            {isSelected && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <span className="text-sm flex-1">{doc.label}</span>
                          {isUploaded && <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">Загружен</span>}
                          {doc.required && !isUploaded && <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Обязательный</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Выбрано документов:</span>
            <span className="font-semibold">{h.selectedDocsForOrder.length}</span>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => { h.setShowOrderDialog(false); }}>Отмена</Button>
            <Button className="flex-1 btn-gradient rounded-xl" onClick={h.handleOrderDocuments} disabled={h.isSubmittingOrder || h.selectedDocsForOrder.length === 0}>
              {h.isSubmittingOrder ? (<><SigmaSpinner size="sm" className="mr-2" />Отправка...</>) : (<><ShoppingCart className="w-4 h-4 mr-2" />Заказать</>)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
