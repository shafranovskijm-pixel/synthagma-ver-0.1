import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Receipt, File, Trash2, Download, FolderOpen, Eye } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "sonner";

interface BillingDoc {
  id: string;
  organization_id: string;
  name: string;
  doc_type: string;
  file_url: string;
  created_at: string;
}

interface OrgBillingDocsTabProps {
  organizationId: string;
}

const docTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  invoice: { label: "Счёт", icon: <FileText className="w-4 h-4 text-blue-500" /> },
  receipt: { label: "Чек", icon: <Receipt className="w-4 h-4 text-emerald-500" /> },
  act: { label: "Акт", icon: <File className="w-4 h-4 text-amber-500" /> },
  other: { label: "Другое", icon: <File className="w-4 h-4 text-muted-foreground" /> },
};

export function OrgBillingDocsTab({ organizationId }: OrgBillingDocsTabProps) {
  const [billingDocs, setBillingDocs] = useState<BillingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadDocType, setUploadDocType] = useState("invoice");
  const [uploadDocName, setUploadDocName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchDocs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("org_billing_documents" as any)
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    setBillingDocs((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [organizationId]);

  const handleUpload = async () => {
    if (!uploadFile || !uploadDocName.trim()) {
      toast.error("Заполните все поля");
      return;
    }
    setUploading(true);
    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${organizationId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("billing-documents")
      .upload(filePath, uploadFile);

    if (uploadError) {
      toast.error("Ошибка загрузки", { description: uploadError.message });
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("org_billing_documents" as any)
      .insert({
        organization_id: organizationId,
        name: uploadDocName.trim(),
        doc_type: uploadDocType,
        file_url: filePath,
      } as any);

    if (dbError) {
      toast.error("Ошибка сохранения", { description: dbError.message });
    } else {
      toast.success("Документ загружен");
      setUploadDocName("");
      setUploadFile(null);
      fetchDocs();
    }
    setUploading(false);
  };

  const handleDelete = async (doc: BillingDoc) => {
    await supabase.storage.from("billing-documents").remove([doc.file_url]);
    const { error } = await supabase
      .from("org_billing_documents" as any)
      .delete()
      .eq("id", doc.id);
    if (error) {
      toast.error("Ошибка удаления", { description: error.message });
    } else {
      toast.success("Документ удалён");
      setBillingDocs(prev => prev.filter(d => d.id !== doc.id));
    }
  };

  const handleView = async (doc: BillingDoc) => {
    const { data } = await supabase.storage
      .from("billing-documents")
      .createSignedUrl(doc.file_url, 3600);
    if (!data?.signedUrl) {
      toast.error("Ошибка", { description: Не удалось получить ссылку });
      return;
    }
    try {
      const res = await fetch(data.signedUrl);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch {
      window.open(data.signedUrl, "_blank");
    }
  };

  const handleDownload = async (doc: BillingDoc) => {
    const { data } = await supabase.storage
      .from("billing-documents")
      .createSignedUrl(doc.file_url, 3600);
    if (!data?.signedUrl) {
      toast.error("Ошибка", { description: Не удалось скачать });
      return;
    }
    try {
      const { downloadHtmlFile } = await import("@/utils/downloadHtmlFile");
      await downloadHtmlFile(data.signedUrl, doc.name);
    } catch {
      toast.error("Ошибка", { description: Не удалось скачать файл });
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground animate-pulse">Загрузка...</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="w-5 h-5 text-primary" />
            Закрывающие документы
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload form */}
          <div className="p-4 rounded-lg border border-dashed border-border bg-muted/20 space-y-3">
            <h4 className="text-sm font-medium">Загрузить документ</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Тип документа</Label>
                <Select value={uploadDocType} onValueChange={setUploadDocType}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Счёт</SelectItem>
                    <SelectItem value="receipt">Чек</SelectItem>
                    <SelectItem value="act">Акт</SelectItem>
                    <SelectItem value="other">Другое</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Название</Label>
                <Input
                  className="h-9 text-sm"
                  placeholder="Счёт №123"
                  value={uploadDocName}
                  onChange={e => setUploadDocName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Файл</Label>
                <Input
                  type="file"
                  className="h-9 text-sm"
                  onChange={e => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <Button size="sm" onClick={handleUpload} disabled={uploading || !uploadFile || !uploadDocName.trim()}>
              <Upload className="w-4 h-4 mr-1" />
              {uploading ? "Загрузка..." : "Загрузить"}
            </Button>
          </div>

          {/* Documents list */}
          {billingDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Документов пока нет</p>
          ) : (
            <div className="space-y-2">
              {billingDocs.map(doc => {
                const dt = docTypeLabels[doc.doc_type] || docTypeLabels.other;
                return (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      {dt.icon}
                      <div>
                        <div className="text-sm font-medium">{doc.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {dt.label} · {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" title="Просмотр" onClick={() => handleView(doc)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Скачать" onClick={() => handleDownload(doc)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(doc)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
