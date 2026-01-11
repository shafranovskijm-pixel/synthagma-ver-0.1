import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
  Presentation,
  FileSpreadsheet,
  Eye,
  Search,
  File,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface LibraryDocument {
  id: string;
  organization_id: string;
  name: string;
  type: string;
  description: string | null;
  file_url: string | null;
  file_size: number | null;
  created_at: string;
}

const LIBRARY_TYPES = [
  { value: "document", label: "Документ (DOC, PDF)", icon: FileText, accept: ".doc,.docx,.pdf" },
  { value: "presentation", label: "Презентация (PPTX)", icon: Presentation, accept: ".ppt,.pptx" },
  { value: "spreadsheet", label: "Таблица (XLSX)", icon: FileSpreadsheet, accept: ".xls,.xlsx" },
  { value: "video", label: "Видеоматериал", icon: Video, accept: ".mp4,.avi,.mov,.webm" },
  { value: "other", label: "Прочее", icon: File, accept: "*" },
];

interface LibraryManagerProps {
  organizationId: string;
}

export function LibraryManager({ organizationId }: LibraryManagerProps) {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Form state
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("document");
  const [docDescription, setDocDescription] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, [organizationId]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("library_documents")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error("Error fetching library documents:", error);
      // Table might not exist yet, that's ok
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
    if (!docName.trim() || !selectedFile) {
      toast.error("Введите название и выберите файл");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `library/${organizationId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("library-files")
        .upload(fileName, selectedFile);

      if (uploadError) {
        console.warn("Upload failed:", uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("library-files")
        .getPublicUrl(fileName);

      const { error } = await supabase
        .from("library_documents")
        .insert({
          organization_id: organizationId,
          name: docName.trim(),
          type: docType,
          description: docDescription.trim() || null,
          file_url: urlData.publicUrl,
          file_size: selectedFile.size,
        });

      if (error) throw error;

      toast.success("Материал добавлен в библиотеку");
      setShowAddDialog(false);
      resetForm();
      fetchDocuments();
    } catch (error) {
      console.error("Error adding document:", error);
      toast.error("Ошибка добавления материала");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (docId: string, fileUrl: string | null) => {
    if (!confirm("Удалить материал из библиотеки?")) return;

    try {
      // Delete from storage if file exists
      if (fileUrl) {
        const path = fileUrl.split("/library-files/")[1];
        if (path) {
          await supabase.storage.from("library-files").remove([path]);
        }
      }

      const { error } = await supabase
        .from("library_documents")
        .delete()
        .eq("id", docId);

      if (error) throw error;

      setDocuments(documents.filter((d) => d.id !== docId));
      toast.success("Материал удалён");
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления");
    }
  };

  const resetForm = () => {
    setDocName("");
    setDocType("document");
    setDocDescription("");
    setSelectedFile(null);
  };

  const getDocTypeInfo = (type: string) => {
    return LIBRARY_TYPES.find((t) => t.value === type) || LIBRARY_TYPES[4];
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = searchQuery === "" || 
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === "all" || doc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const currentTypeConfig = LIBRARY_TYPES.find(t => t.value === docType);

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск материалов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-64 rounded-xl"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48 rounded-xl">
              <SelectValue placeholder="Все типы" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {LIBRARY_TYPES.map((type) => (
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
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="btn-gradient rounded-xl gap-2">
              <Plus className="w-4 h-4" />
              Добавить материал
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle>Добавить учебный материал</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Название *</Label>
                <Input
                  placeholder="Введите название материала"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Тип материала</Label>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LIBRARY_TYPES.map((type) => (
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
                  placeholder="Краткое описание материала"
                  value={docDescription}
                  onChange={(e) => setDocDescription(e.target.value)}
                  className="rounded-xl"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Файл *</Label>
                <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    id="library-upload"
                    className="hidden"
                    accept={currentTypeConfig?.accept || "*"}
                    onChange={handleFileSelect}
                  />
                  <label htmlFor="library-upload" className="cursor-pointer">
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-2 text-primary">
                        <FileText className="w-5 h-5" />
                        <span className="font-medium">{selectedFile.name}</span>
                        <span className="text-sm text-muted-foreground">
                          ({formatFileSize(selectedFile.size)})
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
                        <div className="text-sm text-muted-foreground">
                          Нажмите для выбора файла
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {currentTypeConfig?.accept || "Любой формат"}
                        </div>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              <Button
                className="w-full btn-gradient rounded-xl"
                onClick={handleAdd}
                disabled={isUploading || !docName.trim() || !selectedFile}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  "Добавить в библиотеку"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-5 gap-4">
        {LIBRARY_TYPES.map((type) => {
          const count = documents.filter(d => d.type === type.value).length;
          const TypeIcon = type.icon;
          return (
            <div key={type.value} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TypeIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-xl font-bold">{count}</div>
                  <div className="text-xs text-muted-foreground truncate">{type.label.split(" ")[0]}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Documents list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground bg-card rounded-2xl border border-border">
          <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">Библиотека пуста</p>
          <p className="text-sm mt-1">Добавьте учебные материалы для ваших учеников</p>
        </div>
      ) : (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Материал</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Тип</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Размер</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Добавлен</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-muted-foreground">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => {
                const typeInfo = getDocTypeInfo(doc.type);
                const TypeIcon = typeInfo.icon;
                return (
                  <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <TypeIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{doc.name}</div>
                          {doc.description && (
                            <div className="text-sm text-muted-foreground line-clamp-1">{doc.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                        {typeInfo.label.split(" ")[0]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {formatFileSize(doc.file_size)}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {doc.file_url && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg"
                              onClick={() => window.open(doc.file_url!, "_blank")}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg"
                              onClick={() => {
                                const link = document.createElement("a");
                                link.href = doc.file_url!;
                                link.download = doc.name;
                                link.click();
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg text-destructive hover:text-destructive"
                          onClick={() => handleDelete(doc.id, doc.file_url)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
