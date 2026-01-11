import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  Download,
  Trash2,
  Loader2,
  Upload,
  BookOpen,
  Video,
  Link as LinkIcon,
  Eye,
  File,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface CourseDocument {
  id: string;
  course_id: string;
  name: string;
  type: string;
  description: string | null;
  file_url: string | null;
  created_at: string;
}

const DOCUMENT_TYPES = [
  { value: "material", label: "Учебный материал", icon: BookOpen },
  { value: "presentation", label: "Презентация (PPTX)", icon: File },
  { value: "video", label: "Видео", icon: Video },
  { value: "link", label: "Ссылка", icon: LinkIcon },
  { value: "template", label: "Шаблон", icon: FileText },
  { value: "other", label: "Прочее", icon: File },
];

interface CourseDocumentsManagerProps {
  courseId: string;
  courseName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CourseDocumentsManager({
  courseId,
  courseName,
  isOpen,
  onClose,
}: CourseDocumentsManagerProps) {
  const [documents, setDocuments] = useState<CourseDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Form state
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("material");
  const [docDescription, setDocDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchDocuments();
    }
  }, [isOpen, courseId]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("course_documents")
        .select("*")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching course documents:", error);
      toast.error("Ошибка загрузки документов");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docName) {
        setDocName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleAdd = async () => {
    if (!docName.trim()) {
      toast.error("Введите название");
      return;
    }

    setIsUploading(true);
    try {
      let fileUrl: string | null = null;

      if (docType === "link") {
        fileUrl = linkUrl;
      } else if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `courses/${courseId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("course-files")
          .upload(fileName, selectedFile);

        if (uploadError) {
          console.warn("Upload failed:", uploadError);
        } else {
          const { data: urlData } = supabase.storage
            .from("course-files")
            .getPublicUrl(fileName);
          fileUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase
        .from("course_documents")
        .insert({
          course_id: courseId,
          name: docName.trim(),
          type: docType,
          description: docDescription.trim() || null,
          file_url: fileUrl,
        });

      if (error) throw error;

      toast.success("Документ добавлен");
      setShowAddDialog(false);
      resetForm();
      fetchDocuments();
    } catch (error) {
      console.error("Error adding document:", error);
      toast.error("Ошибка добавления документа");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Удалить документ?")) return;

    try {
      const { error } = await supabase
        .from("course_documents")
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

  const resetForm = () => {
    setDocName("");
    setDocType("material");
    setDocDescription("");
    setSelectedFile(null);
    setLinkUrl("");
  };

  const getDocTypeInfo = (type: string) => {
    return DOCUMENT_TYPES.find((t) => t.value === type) || DOCUMENT_TYPES[4];
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl rounded-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Документы курса: {courseName}
          </DialogTitle>
          <DialogDescription>
            Материалы и документы, доступные всем ученикам курса
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button className="btn-gradient rounded-xl gap-2">
                  <Plus className="w-4 h-4" />
                  Добавить документ
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Добавить документ к курсу</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Название *</Label>
                    <Input
                      placeholder="Введите название"
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Тип</Label>
                    <Select value={docType} onValueChange={setDocType}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <type.icon className="w-4 h-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Описание</Label>
                    <Textarea
                      placeholder="Краткое описание документа"
                      value={docDescription}
                      onChange={(e) => setDocDescription(e.target.value)}
                      className="rounded-xl"
                      rows={2}
                    />
                  </div>

                  {docType === "link" ? (
                    <div className="space-y-2">
                      <Label>URL ссылки</Label>
                      <Input
                        placeholder="https://..."
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        className="rounded-xl"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Файл</Label>
                      <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 transition-colors">
                        <input
                          type="file"
                          id="course-doc-upload"
                          className="hidden"
                          onChange={handleFileSelect}
                        />
                        <label htmlFor="course-doc-upload" className="cursor-pointer">
                          {selectedFile ? (
                            <div className="flex items-center justify-center gap-2 text-primary">
                              <FileText className="w-5 h-5" />
                              <span className="font-medium">{selectedFile.name}</span>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
                              <div className="text-sm text-muted-foreground">
                                Нажмите для выбора файла
                              </div>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>
                  )}

                  <Button
                    className="w-full btn-gradient rounded-xl"
                    onClick={handleAdd}
                    disabled={isUploading || !docName.trim()}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Загрузка...
                      </>
                    ) : (
                      "Добавить"
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Нет документов</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const typeInfo = getDocTypeInfo(doc.type);
                const TypeIcon = typeInfo.icon;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <TypeIcon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{typeInfo.label}</span>
                          <span>•</span>
                          <span>
                            {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                          </span>
                        </div>
                        {doc.description && (
                          <p className="text-sm text-muted-foreground mt-1">{doc.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.file_url && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(doc.file_url!, "_blank")}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {doc.type !== "link" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const link = document.createElement("a");
                                link.href = doc.file_url!;
                                link.download = doc.name;
                                link.click();
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(doc.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
