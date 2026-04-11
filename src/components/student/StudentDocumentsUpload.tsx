import { useState, useEffect, useRef, useCallback } from "react";
import { openPrivateFile, extractStoragePath } from "@/utils/storageHelpers";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  User,
  Shield,
  GraduationCap,
  Upload,
  Trash2,
  Eye,
  Loader2,
  CheckCircle2,
  FileText,
  AlertCircle,
  ChevronDown,
} from "lucide-react";

interface StudentDocumentsUploadProps {
  userId: string;
  organizationId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  embedded?: boolean;
}

interface IdentityDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
}

const DOCUMENT_TYPES = [
  {
    id: "passport",
    label: "Паспорт",
    description: "Копия паспорта (страницы с фото и пропиской)",
    icon: User,
    required: true,
  },
  {
    id: "birth_certificate",
    label: "Свидетельство о рождении",
    description: "Для несовершеннолетних вместо паспорта",
    icon: User,
    required: false,
  },
  {
    id: "snils",
    label: "СНИЛС",
    description: "Обязателен для внесения данных в государственные системы",
    icon: Shield,
    required: true,
  },
  {
    id: "education_document",
    label: "Документ об образовании",
    description: "Аттестат, диплом или справка для подтверждения права на освоение программы",
    icon: GraduationCap,
    required: true,
  },
];

export function StudentDocumentsUpload({
  userId,
  organizationId,
  isOpen,
  onOpenChange,
  embedded = false,
}: StudentDocumentsUploadProps) {
  const [documents, setDocuments] = useState<IdentityDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedDocType, setSelectedDocType] = useState<string | null>(null);
  
  // Swipe to close
  const swipeRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only track swipe from the top area (header)
    const touch = e.touches[0];
    const target = e.target as HTMLElement;
    const isScrollableContent = target.closest('[data-scrollable]');
    
    // Don't start swipe if scrolling inside content
    if (isScrollableContent) {
      const scrollEl = isScrollableContent as HTMLElement;
      if (scrollEl.scrollTop > 0) return;
    }
    
    touchStartY.current = touch.clientY;
    touchCurrentY.current = touch.clientY;
  }, []);
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    
    const touch = e.touches[0];
    touchCurrentY.current = touch.clientY;
    
    const delta = touch.clientY - touchStartY.current;
    
    // Only allow downward swipe
    if (delta > 0) {
      setSwipeOffset(Math.min(delta * 0.5, 150));
    }
  }, []);
  
  const handleTouchEnd = useCallback(() => {
    if (touchStartY.current === null || touchCurrentY.current === null) {
      setSwipeOffset(0);
      return;
    }
    
    const delta = touchCurrentY.current - touchStartY.current;
    
    // If swiped down more than 80px, close the dialog
    if (delta > 80) {
      onOpenChange(false);
    }
    
    setSwipeOffset(0);
    touchStartY.current = null;
    touchCurrentY.current = null;
  }, [onOpenChange]);

  useEffect(() => {
    if (isOpen || embedded) {
      loadDocuments();
    }
  }, [isOpen, embedded]);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("student_identity_documents")
        .select("*")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error loading documents:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadClick = (docType: string) => {
    setSelectedDocType(docType);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDocType) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл слишком большой. Максимальный размер: 10 МБ");
      return;
    }

    setUploadingType(selectedDocType);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/${selectedDocType}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("student-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const docInfo = DOCUMENT_TYPES.find((d) => d.id === selectedDocType);

      const { error: insertError } = await supabase
        .from("student_identity_documents")
        .insert({
          user_id: userId,
          organization_id: organizationId,
          type: selectedDocType,
          name: docInfo?.label || file.name,
          file_url: fileName,
          file_path: fileName,
        });

      if (insertError) throw insertError;

      toast.success("Документ успешно загружен");
      loadDocuments();
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Ошибка загрузки документа");
    } finally {
      setUploadingType(null);
      setSelectedDocType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (doc: IdentityDocument) => {
    try {
      if (doc.file_url) {
        const path = extractStoragePath(doc.file_url, "student-documents");
        if (path) {
          await supabase.storage.from("student-documents").remove([path]);
        }
      }

      const { error } = await supabase
        .from("student_identity_documents")
        .delete()
        .eq("id", doc.id);

      if (error) throw error;

      toast.success("Документ удалён");
      loadDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления документа");
    }
  };

  const getDocumentByType = (type: string) => {
    return documents.find((d) => d.type === type);
  };

  const completedCount = DOCUMENT_TYPES.filter(
    (dt) => dt.required && getDocumentByType(dt.id)
  ).length;
  const requiredCount = DOCUMENT_TYPES.filter((dt) => dt.required).length;

  const mainContent = (
    <div>
      <div className="mb-4">
        <h3 className="font-display flex items-center gap-3 text-lg font-semibold">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
            <div>
              <div>Документы для обучения</div>
              <div className="text-sm font-normal text-muted-foreground">
                Загрузите копии документов
              </div>
            </div>
        </h3>
      </div>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        />

        {/* Progress indicator */}
        <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Заполнено документов</span>
              <span className="text-sm text-muted-foreground">
                {completedCount} из {requiredCount} обязательных
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(completedCount / requiredCount) * 100}%` }}
              />
            </div>
          </div>
          {completedCount === requiredCount && (
            <CheckCircle2 className="w-6 h-6 text-green-500" />
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto" data-scrollable>
            {DOCUMENT_TYPES.map((docType) => {
              const existingDoc = getDocumentByType(docType.id);
              const isUploading = uploadingType === docType.id;
              const Icon = docType.icon;

              return (
                <div
                  key={docType.id}
                  className={`p-4 rounded-xl border transition-colors ${
                    existingDoc
                      ? "bg-green-500/10 border-green-500/30"
                      : "bg-card border-border"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        existingDoc ? "bg-green-500/20" : "bg-muted"
                      }`}
                    >
                      {existingDoc ? (
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      ) : (
                        <Icon className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{docType.label}</span>
                        {docType.required && (
                          <Badge variant="outline" className="text-xs">
                            Обязательно
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {docType.description}
                      </p>
                      <div className="flex gap-2">
                        {existingDoc ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg gap-1"
                              onClick={() =>
                                existingDoc.file_url &&
                                openPrivateFile("student-documents", existingDoc.file_url)
                              }
                            >
                              <Eye className="w-4 h-4" />
                              Просмотреть
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-lg gap-1 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(existingDoc)}
                            >
                              <Trash2 className="w-4 h-4" />
                              Удалить
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-lg gap-1"
                            onClick={() => handleUploadClick(docType.id)}
                            disabled={isUploading}
                          >
                            {isUploading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4" />
                            )}
                            Загрузить
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <strong className="text-foreground">Важно:</strong> Загружайте
            качественные сканы или фотографии документов. Принимаются форматы:
            PDF, JPG, PNG. Максимальный размер файла: 10 МБ.
          </div>
        </div>
        </div>
    </div>
  );

  if (embedded) return mainContent;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-2xl rounded-2xl overflow-hidden"
        style={{ 
          transform: swipeOffset > 0 ? `translateY(${swipeOffset}px)` : undefined,
          opacity: swipeOffset > 0 ? 1 - (swipeOffset / 300) : 1,
          transition: swipeOffset === 0 ? 'transform 0.2s ease-out, opacity 0.2s ease-out' : 'none'
        }}
      >
        <div 
          ref={swipeRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="contents"
        >
          <div className="flex justify-center pt-1 pb-2 md:hidden touch-none">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          {mainContent}
        </div>
      </DialogContent>
    </Dialog>
  );
}
