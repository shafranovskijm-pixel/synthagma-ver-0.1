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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Plus,
  FileText,
  Download,
  Trash2,
  Loader2,
  Upload,
  Search,
  FileCheck,
  Receipt,
  FileSpreadsheet,
  File,
  Filter,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface OrgDocument {
  id: string;
  type: string;
  name: string;
  file_url: string | null;
  created_at: string;
  updated_at: string;
}

const DOCUMENT_TYPES = [
  { value: "contract", label: "Договор", icon: FileCheck },
  { value: "invoice", label: "Счёт", icon: Receipt },
  { value: "act", label: "Акт", icon: FileText },
  { value: "report", label: "Отчёт", icon: FileSpreadsheet },
  { value: "other", label: "Прочее", icon: File },
];

interface OrgDocumentsManagerProps {
  organizationId: string;
}

export function OrgDocumentsManager({ organizationId }: OrgDocumentsManagerProps) {
  const [documents, setDocuments] = useState<OrgDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Upload form state
  const [docName, setDocName] = useState("");
  const [docType, setDocType] = useState("contract");
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
      if (!docName) {
        setDocName(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleUpload = async () => {
    if (!docName.trim()) {
      toast.error("Введите название документа");
      return;
    }

    setIsUploading(true);
    try {
      let fileUrl: string | null = null;

      if (selectedFile) {
        const fileExt = selectedFile.name.split(".").pop();
        const fileName = `${organizationId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("org-documents")
          .upload(fileName, selectedFile);

        if (uploadError) {
          // If bucket doesn't exist, we'll just save the document without file
          console.warn("File upload failed, saving without file:", uploadError);
        } else {
          const { data: urlData } = supabase.storage
            .from("org-documents")
            .getPublicUrl(fileName);
          fileUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase
        .from("org_documents")
        .insert({
          organization_id: organizationId,
          name: docName.trim(),
          type: docType,
          file_url: fileUrl,
        });

      if (error) throw error;

      toast.success("Документ добавлен");
      setShowUploadDialog(false);
      setDocName("");
      setDocType("contract");
      setSelectedFile(null);
      fetchDocuments();
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Ошибка добавления документа");
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

  const getDocTypeInfo = (type: string) => {
    return DOCUMENT_TYPES.find((t) => t.value === type) || DOCUMENT_TYPES[4];
  };

  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || doc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const documentStats = {
    total: documents.length,
    contracts: documents.filter((d) => d.type === "contract").length,
    invoices: documents.filter((d) => d.type === "invoice").length,
    acts: documents.filter((d) => d.type === "act").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xl font-bold">{documentStats.total}</div>
              <div className="text-sm text-muted-foreground">Всего</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sigma-green/10 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-sigma-green" />
            </div>
            <div>
              <div className="text-xl font-bold">{documentStats.contracts}</div>
              <div className="text-sm text-muted-foreground">Договоров</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-accent" />
            </div>
            <div>
              <div className="text-xl font-bold">{documentStats.invoices}</div>
              <div className="text-sm text-muted-foreground">Счетов</div>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-xl font-bold">{documentStats.acts}</div>
              <div className="text-sm text-muted-foreground">Актов</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск документов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-xl"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48 rounded-xl">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Тип документа" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все типы</SelectItem>
              {DOCUMENT_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogTrigger asChild>
            <Button className="btn-gradient rounded-xl gap-2">
              <Plus className="w-4 h-4" />
              Добавить документ
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">Добавить документ</DialogTitle>
              <DialogDescription>
                Загрузите файл или создайте запись о документе
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Название документа *</Label>
                <Input
                  placeholder="Введите название"
                  value={docName}
                  onChange={(e) => setDocName(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Тип документа</Label>
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
                <Label>Файл (необязательно)</Label>
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
                disabled={isUploading || !docName.trim()}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-2" />
                    Добавить
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Documents Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Документы не найдены</p>
            <p className="text-sm">Добавьте первый документ организации</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Дата добавления</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => {
                const typeInfo = getDocTypeInfo(doc.type);
                const TypeIcon = typeInfo.icon;
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                          <TypeIcon className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <span className="font-medium">{doc.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="px-2 py-1 rounded-lg bg-secondary text-sm">
                        {typeInfo.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(doc.created_at), "d MMMM yyyy, HH:mm", {
                        locale: ru,
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
