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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Download,
  Trash2,
  Loader2,
  Upload,
  Search,
  ChevronDown,
  ChevronRight,
  Eye,
  Building2,
  Scale,
  GraduationCap,
  ClipboardList,
  Award,
  Users,
  Wallet,
  Shield,
  FileCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Progress } from "@/components/ui/progress";

interface OrgDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

// Категории документов ДПО
const DOCUMENT_CATEGORIES = [
  {
    id: "founding",
    title: "Основные учредительные и лицензионные документы",
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
    title: "Обязательные локальные нормативные акты (ЛНА) по ст. 30 273-ФЗ и Приказу № 266",
    icon: Scale,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    documents: [
      { type: "admission_rules", label: "Правила приема на обучение по программам ДПО и ПО", required: true },
      { type: "edu_activity_order", label: "Порядок организации и осуществления образовательной деятельности по дополнительным профессиональным программам (и программам профессионального обучения)", required: true },
      { type: "attestation_rules", label: "Положение о формах, периодичности и порядке текущего контроля успеваемости, промежуточной и итоговой аттестации", required: true },
      { type: "edu_relations", label: "Порядок оформления возникновения, приостановления и прекращения образовательных отношений", required: true },
      { type: "expulsion_rules", label: "Правила отчисления, перевода и восстановления обучающихся", required: true },
      { type: "program_dev_rules", label: "Положение о порядке разработки и утверждения дополнительных профессиональных программ (и программ ПО)", required: true },
      { type: "vsoko", label: "Положение о внутренней системе оценки качества образования (ВСОКО)", required: true },
      { type: "elearning_rules", label: "Положение о порядке применения электронного обучения и дистанционных образовательных технологий", required: false },
      { type: "practice_rules", label: "Положение о практике (стажировке) обучающихся", required: false },
    ],
  },
  {
    id: "qualification_docs",
    title: "Документы по выдаче и учету документов об образовании/квалификации",
    icon: Award,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    documents: [
      { type: "qualification_issuance", label: "Положение о порядке оформления, выдачи и учета документов о квалификации (удостоверения о повышении квалификации, дипломы о профессиональной переподготовке) и документов об обучении", required: true },
      { type: "credit_rules", label: "Положение о порядке зачета результатов обучения (в т.ч. ранее полученных компетенций)", required: true },
    ],
  },
  {
    id: "additional_lna",
    title: "Дополнительные обязательные ЛНА (часто требуются при проверках)",
    icon: ClipboardList,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    documents: [
      { type: "salary_rules", label: "Положение об оплате труда работников (включая педагогических)", required: true },
      { type: "pedagogical_council", label: "Положение о педагогическом (научно-методическом) совете", required: true },
      { type: "paid_services", label: "Положение о порядке оказания платных образовательных услуг", required: false },
      { type: "personal_data", label: "Положение о защите персональных данных обучающихся и работников", required: true },
    ],
  },
  {
    id: "orders",
    title: "Основные приказы (распорядительные документы)",
    icon: FileCheck,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    documents: [
      { type: "program_approval", label: "Приказы об утверждении конкретных образовательных программ ДПО / ПО", required: true },
      { type: "enrollment_orders", label: "Приказы о зачислении / отчислении слушателей", required: true },
      { type: "schedule_approval", label: "Приказ об утверждении календарного учебного графика / расписания", required: true },
      { type: "commission_orders", label: "Приказы о создании комиссий (аттестационной, апелляционной и др.)", required: true },
      { type: "doc_forms_approval", label: "Приказ об утверждении форм документов об образовании и квалификации", required: true },
    ],
  },
];

// Получить все типы документов
const getAllDocumentTypes = () => {
  const types: { value: string; label: string; categoryId: string }[] = [];
  DOCUMENT_CATEGORIES.forEach((cat) => {
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
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    DOCUMENT_CATEGORIES.map((c) => c.id)
  );

  // Upload form state
  const [uploadDocType, setUploadDocType] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const getDocumentForType = (docType: string) => {
    return documents.find((d) => d.type === docType);
  };

  // Calculate statistics
  const totalRequired = DOCUMENT_CATEGORIES.reduce(
    (acc, cat) => acc + cat.documents.filter((d) => d.required).length,
    0
  );
  const uploadedRequired = DOCUMENT_CATEGORIES.reduce(
    (acc, cat) =>
      acc +
      cat.documents.filter((d) => d.required && getDocumentForType(d.type)).length,
    0
  );
  const completionPercent = totalRequired > 0 ? Math.round((uploadedRequired / totalRequired) * 100) : 0;

  // Filter categories based on search
  const filteredCategories = DOCUMENT_CATEGORIES.map((cat) => ({
    ...cat,
    documents: cat.documents.filter((doc) =>
      doc.label.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((cat) => cat.documents.length > 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

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

      {/* Document Categories */}
      <div className="space-y-4">
        {filteredCategories.map((category) => {
          const CategoryIcon = category.icon;
          const isExpanded = expandedCategories.includes(category.id);
          const categoryDocs = category.documents;
          const uploadedCount = categoryDocs.filter((d) => getDocumentForType(d.type)).length;
          const requiredCount = categoryDocs.filter((d) => d.required).length;
          const uploadedRequiredCount = categoryDocs.filter(
            (d) => d.required && getDocumentForType(d.type)
          ).length;

          return (
            <Collapsible
              key={category.id}
              open={isExpanded}
              onOpenChange={() => toggleCategory(category.id)}
            >
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg ${category.bgColor} flex items-center justify-center`}>
                        <CategoryIcon className={`w-5 h-5 ${category.color}`} />
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold">{category.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          Загружено {uploadedCount} из {categoryDocs.length} документов
                          {requiredCount > 0 && (
                            <span className="ml-2">
                              (обязательных: {uploadedRequiredCount}/{requiredCount})
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {uploadedRequiredCount === requiredCount && requiredCount > 0 && (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      )}
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t border-border">
                    {categoryDocs.map((docItem) => {
                      const uploadedDoc = getDocumentForType(docItem.type);
                      const hasFile = !!uploadedDoc?.file_url;

                      return (
                        <div
                          key={docItem.type}
                          className="flex items-center justify-between p-4 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors"
                        >
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                hasFile
                                  ? "bg-green-500/10"
                                  : docItem.required
                                  ? "bg-destructive/10"
                                  : "bg-secondary"
                              }`}
                            >
                              {hasFile ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              ) : docItem.required ? (
                                <AlertCircle className="w-4 h-4 text-destructive" />
                              ) : (
                                <FileText className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate">{docItem.label}</span>
                                {docItem.required && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-destructive/10 text-destructive flex-shrink-0">
                                    Обязательный
                                  </span>
                                )}
                              </div>
                              {uploadedDoc && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  Загружен{" "}
                                  {format(new Date(uploadedDoc.updated_at), "d MMMM yyyy", {
                                    locale: ru,
                                  })}
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
                            <Button
                              variant={hasFile ? "outline" : "default"}
                              size="sm"
                              onClick={() => openUploadDialog(docItem.type)}
                              className="rounded-lg"
                            >
                              <Upload className="w-4 h-4 mr-2" />
                              {hasFile ? "Заменить" : "Загрузить"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

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
    </div>
  );
}
