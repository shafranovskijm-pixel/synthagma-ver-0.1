import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  FileText,
  Receipt,
  FileCheck,
  Upload,
  Trash2,
  Download,
  Loader2,
  Plus,
  History,
  Link2,
} from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { DocumentDropZone } from "@/components/organization/DocumentDropZone";
import { OrgDocumentVersionsDialog } from "@/components/organization/OrgDocumentVersionsDialog";
import { OrgDocumentShareDialog } from "@/components/organization/OrgDocumentShareDialog";

interface OrgDocument {
  id: string;
  name: string;
  type: string;
  file_url: string | null;
  created_at: string;
}

interface OrgDocumentsTabProps {
  organizationId: string;
  documents: OrgDocument[];
  onDocumentsChange: () => void;
}

const DOCUMENT_TYPES = [
  { value: "contract", label: "Договор", icon: FileText, color: "text-orange-500" },
  { value: "invoice", label: "Счёт", icon: Receipt, color: "text-blue-500" },
  { value: "act", label: "Акт", icon: FileCheck, color: "text-green-500" },
  { value: "other", label: "Другое", icon: FileText, color: "text-muted-foreground" },
];

export function OrgDocumentsTab({ organizationId, documents, onDocumentsChange }: OrgDocumentsTabProps) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const getTypeConfig = (type: string) => {
    return DOCUMENT_TYPES.find(t => t.value === type) || DOCUMENT_TYPES[3];
  };

  const handleUpload = async (file: File, type: string) => {
    setUploadingType(type);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${organizationId}/${type}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("org-documents")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("org-documents")
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from("org_documents")
        .insert({
          organization_id: organizationId,
          name: file.name,
          type: type,
          file_url: publicUrl,
        });

      if (dbError) throw dbError;

      toast.success("Документ загружен");
      onDocumentsChange();
      setIsUploadOpen(false);
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Ошибка загрузки документа");
    } finally {
      setUploadingType(null);
    }
  };

  const handleDelete = async (doc: OrgDocument) => {
    if (!confirm(`Удалить документ "${doc.name}"?`)) return;

    try {
      if (doc.file_url) {
        const path = doc.file_url.split("/org-documents/")[1];
        if (path) {
          await supabase.storage.from("org-documents").remove([path]);
        }
      }

      const { error } = await supabase
        .from("org_documents")
        .delete()
        .eq("id", doc.id);

      if (error) throw error;

      toast.success("Документ удалён");
      onDocumentsChange();
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Ошибка удаления документа");
    }
  };

  const documentsByType = DOCUMENT_TYPES.slice(0, 3).map(type => ({
    ...type,
    count: documents.filter(d => d.type === type.value).length,
  }));

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        {documentsByType.map(type => {
          const Icon = type.icon;
          return (
            <Card key={type.value}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1">
                  <Icon className={`w-3 h-3 ${type.color}`} />
                  {type.label}
                </CardDescription>
                <CardTitle className="text-2xl">{type.count}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {/* Upload Button */}
      <div className="flex justify-end">
        <Button onClick={() => setIsUploadOpen(true)} className="btn-gradient">
          <Plus className="w-4 h-4 mr-2" />
          Загрузить документ
        </Button>
      </div>

      {/* Documents Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => {
                const typeConfig = getTypeConfig(doc.type);
                const Icon = typeConfig.icon;
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${typeConfig.color}`} />
                        <span className="font-medium">{doc.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={typeConfig.color}>
                        {typeConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {doc.file_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(doc.file_url!, "_blank")}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => handleDelete(doc)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Нет документов
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Upload Dialog */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Загрузить документ</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <DocumentDropZone
              type="contract"
              isUploading={uploadingType === "contract"}
              onUpload={(file) => handleUpload(file, "contract")}
            />
            <DocumentDropZone
              type="invoice"
              isUploading={uploadingType === "invoice"}
              onUpload={(file) => handleUpload(file, "invoice")}
            />
            <DocumentDropZone
              type="act"
              isUploading={uploadingType === "act"}
              onUpload={(file) => handleUpload(file, "act")}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
