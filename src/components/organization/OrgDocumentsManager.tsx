import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Trash2,
  Loader2,
  Upload,
  Search,
  Eye,
  Building2,
  Scale,
  GraduationCap,
  ClipboardList,
  Award,
  Users,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";
import { OrdersArchive } from "./OrdersArchive";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface OrgDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

// Основные категории документов (обычные)
const REGULAR_CATEGORIES = [
  {
    id: "founding",
    title: "Учредительные документы",
    shortTitle: "Учредительные",
    icon: Building2,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    documents: [
      { type: "charter", label: "Устав организации", required: true },
      { type: "license", label: "Лицензия на осуществление образовательной деятельности (с приложениями)", required: true },
      { type: "registration", label: "Свидетельство о государственной регистрации юридического лица", required: true },
    ],
  },
  {
    id: "lna_main",
    title: "Локальные нормативные акты",
    shortTitle: "ЛНА",
    icon: Scale,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    documents: [
      { type: "admission_rules", label: "Правила приема на обучение по программам ДПО и ПО", required: true },
      { type: "edu_activity_order", label: "Порядок организации и осуществления образовательной деятельности по дополнительным профессиональным программам", required: true },
      { type: "attestation_rules", label: "Положение о формах, периодичности и порядке текущего контроля успеваемости, промежуточной и итоговой аттестации", required: true },
      { type: "edu_relations", label: "Порядок оформления возникновения, приостановления и прекращения образовательных отношений", required: true },
      { type: "expulsion_rules", label: "Правила отчисления, перевода и восстановления обучающихся", required: true },
      { type: "program_dev_rules", label: "Положение о порядке разработки и утверждения дополнительных профессиональных программ", required: true },
      { type: "vsoko", label: "Положение о внутренней системе оценки качества образования (ВСОКО)", required: true },
      { type: "elearning_rules", label: "Положение о порядке применения электронного обучения и дистанционных образовательных технологий", required: false },
      { type: "practice_rules", label: "Положение о практике (стажировке) обучающихся", required: false },
    ],
  },
  {
    id: "qualification_docs",
    title: "Документы о квалификации",
    shortTitle: "Квалификация",
    icon: Award,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    documents: [
      { type: "qualification_issuance", label: "Положение о порядке оформления, выдачи и учета документов о квалификации", required: true },
      { type: "credit_rules", label: "Положение о порядке зачета результатов обучения", required: true },
    ],
  },
  {
    id: "additional_lna",
    title: "Дополнительные ЛНА",
    shortTitle: "Доп. ЛНА",
    icon: ClipboardList,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    documents: [
      { type: "salary_rules", label: "Положение об оплате труда работников", required: true },
      { type: "pedagogical_council", label: "Положение о педагогическом совете", required: true },
      { type: "paid_services", label: "Положение о порядке оказания платных образовательных услуг", required: false },
      { type: "personal_data", label: "Положение о защите персональных данных", required: true },
    ],
  },
  {
    id: "orders",
    title: "Основные приказы",
    shortTitle: "Приказы (осн.)",
    icon: FileCheck,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    documents: [
      { type: "program_approval", label: "Приказы об утверждении образовательных программ", required: true },
      { type: "schedule_approval", label: "Приказ об утверждении календарного учебного графика", required: true },
      { type: "commission_orders", label: "Приказы о создании комиссий", required: true },
      { type: "doc_forms_approval", label: "Приказ об утверждении форм документов об образовании", required: true },
    ],
  },
  {
    id: "annual_reports",
    title: "Отчёты",
    shortTitle: "Отчёты",
    icon: FileText,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    documents: [
      { type: "self_examination_report", label: "Отчёт о результатах самообследования", required: true, annual: true },
    ],
  },
];

// Специальные категории с отдельным интерфейсом (в аккордеоне слева)
const SPECIAL_CATEGORIES = [
  {
    id: "enrollment_orders",
    title: "Приказы о зачислении / отчислении",
    shortTitle: "Приказы зач./отч.",
    icon: Users,
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
    documents: [
      { type: "enrollment_order", label: "Приказ о зачислении", required: false },
      { type: "expulsion_order", label: "Приказ об отчислении", required: false },
    ],
  },
  {
    id: "attestation_protocols",
    title: "Протоколы аттестационной комиссии",
    shortTitle: "Протоколы АК",
    icon: ClipboardList,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    documents: [
      { type: "attestation_protocol", label: "Протокол аттестационной комиссии", required: false },
    ],
  },
  {
    id: "certificates",
    title: "Удостоверения",
    shortTitle: "Удостоверения",
    icon: Award,
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    documents: [
      { type: "certificate_qualification", label: "Удостоверение о повышении квалификации", required: false },
    ],
  },
  {
    id: "diplomas",
    title: "Дипломы",
    shortTitle: "Дипломы",
    icon: GraduationCap,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    documents: [
      { type: "diploma_retraining", label: "Диплом о профессиональной переподготовке", required: false },
    ],
  },
  {
    id: "testimonials",
    title: "Свидетельства",
    shortTitle: "Свидетельства",
    icon: FileCheck,
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    documents: [
      { type: "testimonial_profession", label: "Свидетельство о профессии рабочего", required: false },
      { type: "testimonial_position", label: "Свидетельство о должности служащего", required: false },
    ],
  },
];

const ALL_CATEGORIES = [...REGULAR_CATEGORIES, ...SPECIAL_CATEGORIES];

// Получить все типы документов
const getAllDocumentTypes = () => {
  const types: { value: string; label: string; categoryId: string }[] = [];
  ALL_CATEGORIES.forEach((cat) => {
    cat.documents.forEach((doc) => {
      types.push({
        value: doc.type,
        label: doc.label,
        categoryId: cat.id,
      });
    });
  });
  return types;
};

interface OrgDocumentsManagerProps {
  organizationId: string;
}

export function OrgDocumentsManager({ organizationId }: OrgDocumentsManagerProps) {
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Активная категория (null = обзор)
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Upload form state
  const [uploadDocType, setUploadDocType] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Auto-generation service dialog state
  const [showAutoGenDialog, setShowAutoGenDialog] = useState(false);
  const [autoGenNotes, setAutoGenNotes] = useState("");
  const [isSubmittingAutoGen, setIsSubmittingAutoGen] = useState(false);
  const [showAutoGenSuccessDialog, setShowAutoGenSuccessDialog] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, [organizationId]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("org_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Ошибка загрузки документов");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadDocType) {
      toast.error("Выберите файл");
      return;
    }

    const docTypeInfo = getAllDocumentTypes().find((t) => t.value === uploadDocType);
    if (!docTypeInfo) return;

    setIsUploading(true);
    try {
      let fileUrl: string | null = null;

      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${organizationId}/${uploadDocType}-${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("org-documents")
        .upload(fileName, selectedFile);

      if (uploadError) {
        console.warn("File upload failed:", uploadError);
      } else {
        const { data: urlData } = supabase.storage
          .from("org-documents")
          .getPublicUrl(fileName);
        fileUrl = urlData.publicUrl;
      }

      // Check if document of this type already exists
      const existingDoc = documents.find((d) => d.type === uploadDocType);
      
      if (existingDoc) {
        // Update existing document
        const { error } = await supabase
          .from("org_documents")
          .update({
            name: docTypeInfo.label,
            file_url: fileUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingDoc.id);

        if (error) throw error;
        toast.success("Документ обновлён");
      } else {
        // Create new document
        const { error } = await supabase
          .from("org_documents")
          .insert({
            organization_id: organizationId,
            name: docTypeInfo.label,
            type: uploadDocType,
            file_url: fileUrl,
          });

        if (error) throw error;
        toast.success("Документ загружен");
      }

      setShowUploadDialog(false);
      setUploadDocType("");
      setSelectedFile(null);
      fetchDocuments();
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Ошибка загрузки документа");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Удалить документ?")) return;

    try {
      const { error } = await supabase
        .from("org_documents")
        .delete()
        .eq("id", docId);

      if (error) throw error;

      setDocuments(documents.filter((d) => d.id !== docId));
      toast.success("Документ удалён");
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления");
    }
  };

  const openUploadDialog = (docType: string) => {
    setUploadDocType(docType);
    setSelectedFile(null);
    setShowUploadDialog(true);
  };

  const handleSubmitAutoGenOrder = async () => {
    setIsSubmittingAutoGen(true);
    try {
      const { error } = await supabase
        .from('service_orders')
        .insert({
          organization_id: organizationId,
          service_id: 'self_examination_report_auto',
          service_title: 'Автоформирование отчёта о результатах самообследования',
          service_price: '3 500 ₽',
          notes: autoGenNotes || null,
          status: 'pending'
        });

      if (error) throw error;

      setShowAutoGenDialog(false);
      setAutoGenNotes("");
      setShowAutoGenSuccessDialog(true);
      toast.success('Заявка на автоформирование отправлена!');
    } catch (error: any) {
      console.error('Error submitting auto-gen order:', error);
      toast.error('Ошибка при отправке заявки');
    } finally {
      setIsSubmittingAutoGen(false);
    }
  };

  const getDocumentForType = (docType: string) => {
    return documents.find((d) => d.type === docType);
  };

  const getDocumentsForCategory = (categoryId: string) => {
    const category = ALL_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return [];
    return documents.filter((d) => 
      category.documents.some((cd) => cd.type === d.type)
    );
  };

  // Calculate statistics
  const totalRequired = REGULAR_CATEGORIES.reduce(
    (acc, cat) => acc + cat.documents.filter((d) => d.required).length,
    0
  );
  const uploadedRequired = REGULAR_CATEGORIES.reduce(
    (acc, cat) =>
      acc +
      cat.documents.filter((d) => d.required && getDocumentForType(d.type)).length,
    0
  );
  const completionPercent = totalRequired > 0 ? Math.round((uploadedRequired / totalRequired) * 100) : 0;

  // Render content based on active category
  const renderContent = () => {
    if (!activeCategory) {
      // Overview - показываем статистику и все обычные категории
      return (
        <div className="space-y-6">
          {/* Stats Card */}
          <div className="bg-card rounded-2xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Комплектность документов</h3>
                  <p className="text-sm text-muted-foreground">
                    Обязательные документы для ДПО и ПО по 273-ФЗ
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-primary">{completionPercent}%</div>
                <div className="text-sm text-muted-foreground">
                  {uploadedRequired} из {totalRequired} обязательных
                </div>
              </div>
            </div>
            <Progress value={completionPercent} className="h-2" />
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск документов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>

          {/* Regular Categories Accordion */}
          <Accordion type="multiple" className="space-y-4">
            {REGULAR_CATEGORIES.map((category) => {
              const CategoryIcon = category.icon;
              const categoryDocs = category.documents;
              const uploadedCount = categoryDocs.filter((d) => getDocumentForType(d.type)).length;
              const requiredCount = categoryDocs.filter((d) => d.required).length;
              const uploadedRequiredCount = categoryDocs.filter(
                (d) => d.required && getDocumentForType(d.type)
              ).length;

              const filteredDocs = searchQuery 
                ? categoryDocs.filter((doc) => 
                    doc.label.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                : categoryDocs;

              if (searchQuery && filteredDocs.length === 0) return null;

              // Check for annual report reminder
              const annualDocs = categoryDocs.filter((d: any) => d.annual);
              const annualReminders = annualDocs.map((d: any) => {
                const uploadedDoc = getDocumentForType(d.type);
                if (!uploadedDoc) return { type: d.type, label: d.label, needsUpdate: true, daysSince: null };
                const lastUpdate = new Date(uploadedDoc.updated_at);
                const now = new Date();
                const daysSince = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
                const needsUpdate = daysSince >= 365;
                return { type: d.type, label: d.label, needsUpdate, daysSince };
              });
              const hasAnnualReminder = annualReminders.some(r => r.needsUpdate);

              return (
                <AccordionItem 
                  key={category.id} 
                  value={category.id}
                  className="bg-card rounded-2xl border border-border overflow-hidden"
                >
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
                                <AlertCircle className="w-3 h-3" />
                                Требуется обновление
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {uploadedCount} из {categoryDocs.length} загружено
                            {requiredCount > 0 && (
                              <span className="ml-2">(обязательных: {uploadedRequiredCount}/{requiredCount})</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {uploadedRequiredCount === requiredCount && requiredCount > 0 && (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-0 pb-0">
                    <div className="divide-y divide-border border-t border-border">
                      {(searchQuery ? filteredDocs : categoryDocs).map((docItem: any) => {
                        const uploadedDoc = getDocumentForType(docItem.type);
                        const hasFile = !!uploadedDoc?.file_url;
                        
                        // Check if this is an annual document that needs update
                        const isAnnual = docItem.annual;
                        let annualStatus: { needsUpdate: boolean; daysSince: number | null; daysUntil: number | null } | null = null;
                        if (isAnnual && uploadedDoc) {
                          const lastUpdate = new Date(uploadedDoc.updated_at);
                          const now = new Date();
                          const daysSince = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
                          const daysUntil = 365 - daysSince;
                          annualStatus = { 
                            needsUpdate: daysSince >= 365, 
                            daysSince,
                            daysUntil: daysUntil > 0 ? daysUntil : 0
                          };
                        }

                        return (
                          <div
                            key={docItem.type}
                            className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  hasFile
                                    ? annualStatus?.needsUpdate 
                                      ? "bg-amber-500/10"
                                      : "bg-green-500/10"
                                    : docItem.required
                                    ? "bg-destructive/10"
                                    : "bg-secondary"
                                }`}
                              >
                                {hasFile ? (
                                  annualStatus?.needsUpdate ? (
                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                  ) : (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                  )
                                ) : docItem.required ? (
                                  <AlertCircle className="w-4 h-4 text-destructive" />
                                ) : (
                                  <FileText className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium truncate">{docItem.label}</span>
                                  {docItem.required && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive flex-shrink-0">
                                      Обязательный
                                    </span>
                                  )}
                                  {isAnnual && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 flex-shrink-0">
                                      Ежегодный
                                    </span>
                                  )}
                                </div>
                                {uploadedDoc && (
                                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                                    <span>Загружен {format(new Date(uploadedDoc.updated_at), "d MMMM yyyy", { locale: ru })}</span>
                                    {annualStatus && !annualStatus.needsUpdate && annualStatus.daysUntil !== null && (
                                      <span className="text-blue-600">
                                        (до обновления: {annualStatus.daysUntil} дн.)
                                      </span>
                                    )}
                                    {annualStatus?.needsUpdate && (
                                      <span className="text-amber-600 font-medium">
                                        ⚠️ Требуется обновление (прошло {annualStatus.daysSince} дн.)
                                      </span>
                                    )}
                                  </div>
                                )}
                                {isAnnual && !uploadedDoc && (
                                  <div className="text-xs text-amber-600 mt-0.5">
                                    ⚠️ Отчёт не загружен — необходимо загрузить ежегодно
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                              {hasFile && uploadedDoc && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => window.open(uploadedDoc.file_url!, "_blank")}
                                    title="Просмотр"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      const link = document.createElement("a");
                                      link.href = uploadedDoc.file_url!;
                                      link.download = docItem.label;
                                      link.click();
                                    }}
                                    title="Скачать"
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDelete(uploadedDoc.id)}
                                    className="text-destructive hover:text-destructive"
                                    title="Удалить"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </>
                              )}
                              {/* Кнопка заказа автоформирования для отчёта самообследования */}
                              {docItem.type === 'self_examination_report' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setShowAutoGenDialog(true)}
                                  className="rounded-lg border-primary/50 text-primary hover:bg-primary/10"
                                  title="Заказать автоформирование отчёта"
                                >
                                  <Sparkles className="w-4 h-4 mr-2" />
                                  Сформировать за 3 500 ₽
                                </Button>
                              )}
                              <Button
                                variant={hasFile ? (annualStatus?.needsUpdate ? "default" : "outline") : "default"}
                                size="sm"
                                onClick={() => openUploadDialog(docItem.type)}
                                className={cn("rounded-lg", annualStatus?.needsUpdate && "bg-amber-500 hover:bg-amber-600")}
                              >
                                <Upload className="w-4 h-4 mr-2" />
                                {annualStatus?.needsUpdate ? "Обновить" : hasFile ? "Заменить" : "Загрузить"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      );
    }

    // Специальные категории с архивным интерфейсом
    const category = SPECIAL_CATEGORIES.find((c) => c.id === activeCategory);
    if (!category) return null;

    const CategoryIcon = category.icon;
    const categoryDocs = getDocumentsForCategory(category.id);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-12 h-12 rounded-xl ${category.bgColor} flex items-center justify-center`}>
            <CategoryIcon className={`w-6 h-6 ${category.color}`} />
          </div>
          <div>
            <h2 className="text-xl font-bold">{category.title}</h2>
            <p className="text-sm text-muted-foreground">
              {categoryDocs.length} документов
            </p>
          </div>
        </div>

        {/* Use OrdersArchive for orders, otherwise show document list */}
        {activeCategory === "enrollment_orders" ? (
          <OrdersArchive
            documents={documents}
            onDelete={handleDelete}
            onView={(url) => window.open(url, "_blank")}
          />
        ) : (
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {categoryDocs.length === 0 ? (
              <div className="p-12 text-center">
                <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">Нет документов</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  В этой категории пока нет загруженных документов
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {categoryDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium truncate block">{doc.name}</span>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(doc.created_at), "d MMMM yyyy, HH:mm", { locale: ru })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {doc.file_url && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(doc.file_url!, "_blank")}
                            title="Просмотр"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = doc.file_url!;
                              link.download = doc.name;
                              link.click();
                            }}
                            title="Скачать"
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(doc.id)}
                        className="text-destructive hover:text-destructive"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {renderContent()}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Загрузить документ</DialogTitle>
            <DialogDescription>
              {getAllDocumentTypes().find((t) => t.value === uploadDocType)?.label}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Файл документа</Label>
              <div className="border-2 border-dashed border-border rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  onChange={handleFileSelect}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {selectedFile ? (
                    <div className="flex items-center justify-center gap-2 text-primary">
                      <FileText className="w-5 h-5" />
                      <span className="font-medium">{selectedFile.name}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                      <div className="text-sm text-muted-foreground">
                        Нажмите для выбора файла
                      </div>
                      <div className="text-xs text-muted-foreground">
                        PDF, DOC, DOCX, XLS, XLSX, JPG, PNG
                      </div>
                    </div>
                  )}
                </label>
              </div>
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleUpload}
              disabled={isUploading || !selectedFile}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Загрузка...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Загрузить
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto-generation Order Dialog */}
      <Dialog open={showAutoGenDialog} onOpenChange={setShowAutoGenDialog}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Автоформирование отчёта
            </DialogTitle>
            <DialogDescription>
              Закажите автоматическое формирование отчёта о результатах самообследования
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-4 border border-primary/20">
              <div className="flex justify-between items-center mb-2">
                <span className="text-muted-foreground">Услуга:</span>
                <span className="font-medium">Отчёт о результатах самообследования</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Стоимость:</span>
                <span className="font-bold text-primary text-xl">3 500 ₽</span>
              </div>
            </div>
            <div className="bg-secondary/50 rounded-xl p-4 text-sm space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Что входит в услугу:
              </h4>
              <ul className="text-muted-foreground space-y-1 ml-6">
                <li>• Анализ данных организации</li>
                <li>• Формирование отчёта по требованиям 273-ФЗ</li>
                <li>• Оформление в соответствии со стандартами</li>
                <li>• Готовый документ в формате PDF и DOCX</li>
              </ul>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Комментарий к заявке (необязательно)</label>
              <Textarea
                placeholder="Опишите ваши пожелания или уточнения..."
                value={autoGenNotes}
                onChange={(e) => setAutoGenNotes(e.target.value)}
                className="rounded-xl min-h-[80px]"
              />
            </div>
            <Button
              className="w-full btn-gradient rounded-xl"
              onClick={handleSubmitAutoGenOrder}
              disabled={isSubmittingAutoGen}
            >
              {isSubmittingAutoGen ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Заказать за 3 500 ₽
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Auto-generation Success Dialog */}
      <Dialog open={showAutoGenSuccessDialog} onOpenChange={setShowAutoGenSuccessDialog}>
        <DialogContent className="rounded-2xl text-center">
          <div className="py-6">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <DialogTitle className="font-display text-xl mb-2">Заявка отправлена!</DialogTitle>
            <DialogDescription className="text-base">
              Мы получили вашу заявку на формирование отчёта о результатах самообследования и свяжемся с вами в ближайшее время.
            </DialogDescription>
            <Button
              className="mt-6 btn-gradient rounded-xl"
              onClick={() => setShowAutoGenSuccessDialog(false)}
            >
              Отлично
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
