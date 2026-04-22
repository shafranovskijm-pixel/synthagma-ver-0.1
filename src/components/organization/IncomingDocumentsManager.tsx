import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Upload,
  Inbox,
  FileText,
  ExternalLink,
  Trash2,
  Calendar,
  Building2,
  Search,
  Eye,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useIncomingDocuments,
  type IncomingDocType,
  type IncomingDocument,
} from "@/hooks/useIncomingDocuments";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  organizationId: string;
}

const DOC_TYPE_LABELS: Record<IncomingDocType, string> = {
  contract: "Договор",
  act: "Акт",
  invoice: "Счёт",
  other: "Прочее",
};

const DOC_TYPE_VARIANTS: Record<IncomingDocType, any> = {
  contract: "default",
  act: "secondary",
  invoice: "outline",
  other: "outline",
};

export function IncomingDocumentsManager({ organizationId }: Props) {
  const { items, loading, uploading, upload, remove } = useIncomingDocuments(organizationId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<IncomingDocType | "all">("all");
  const [previewDoc, setPreviewDoc] = useState<IncomingDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    doc_type: "contract" as IncomingDocType,
    title: "",
    counterparty_name: "",
    counterparty_inn: "",
    doc_number: "",
    doc_date: "",
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((d) => {
      if (typeFilter !== "all" && d.doc_type !== typeFilter) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        (d.counterparty_name || "").toLowerCase().includes(q) ||
        (d.counterparty_inn || "").toLowerCase().includes(q) ||
        (d.doc_number || "").toLowerCase().includes(q)
      );
    });
  }, [items, search, typeFilter]);

  const getSignedUrl = async (doc: IncomingDocument): Promise<string | null> => {
    if (doc.file_path) {
      const { data, error } = await supabase.storage
        .from("incoming-documents")
        .createSignedUrl(doc.file_path, 3600);
      if (error || !data?.signedUrl) {
        toast.error("Не удалось получить ссылку", { description: error?.message });
        return null;
      }
      return data.signedUrl;
    }
    return doc.file_url || null;
  };

  const openPreview = async (doc: IncomingDocument) => {
    const url = await getSignedUrl(doc);
    if (!url) return;
    setPreviewDoc(doc);
    setPreviewUrl(url);
  };

  const downloadFile = async (doc: IncomingDocument) => {
    const url = await getSignedUrl(doc);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.title;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const isPreviewable = (doc: IncomingDocument | null) => {
    if (!doc) return false;
    const name = (doc.file_path || doc.title || "").toLowerCase();
    return name.endsWith(".pdf") || /\.(jpe?g|png|webp|gif)$/i.test(name);
  };
  const isImage = (doc: IncomingDocument | null) => {
    if (!doc) return false;
    return /\.(jpe?g|png|webp|gif)$/i.test((doc.file_path || doc.title || "").toLowerCase());
  };

  const reset = () => {
    setForm({
      doc_type: "contract",
      title: "",
      counterparty_name: "",
      counterparty_inn: "",
      doc_number: "",
      doc_date: "",
      notes: "",
    });
    setFile(null);
  };

  const handleSubmit = async () => {
    if (!file || !form.title.trim()) return;
    const ok = await upload({
      doc_type: form.doc_type,
      title: form.title,
      counterparty_name: form.counterparty_name || undefined,
      counterparty_inn: form.counterparty_inn || undefined,
      doc_number: form.doc_number || undefined,
      doc_date: form.doc_date || null,
      notes: form.notes || undefined,
      file,
    });
    if (ok) {
      setDialogOpen(false);
      reset();
    }
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Inbox className="w-4 h-4 text-primary" />
              Входящие документы
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Сканы подписанных контрагентом экземпляров — для двустороннего документооборота
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2 rounded-xl">
            <Upload className="w-4 h-4" />
            Загрузить
          </Button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Загрузка...</div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Inbox className="w-10 h-10 text-primary/40" />
            </div>
            <div>
              <p className="text-base font-semibold">Пока нет входящих документов</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Загружайте сюда сканы подписанных контрагентом договоров, актов и счетов — для двустороннего документооборота.
              </p>
            </div>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2 rounded-xl mt-2">
              <Upload className="w-4 h-4" />
              Загрузить первый документ
            </Button>
          </div>
        ) : (
          <div className="divide-y">
            {items.map((doc) => (
              <div
                key={doc.id}
                className="p-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <FileText className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{doc.title}</p>
                      <Badge variant={DOC_TYPE_VARIANTS[doc.doc_type]}>
                        {DOC_TYPE_LABELS[doc.doc_type]}
                      </Badge>
                      {doc.doc_number && (
                        <span className="text-xs text-muted-foreground">№ {doc.doc_number}</span>
                      )}
                    </div>
                    {doc.counterparty_name && (
                      <p className="text-sm text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" />
                        {doc.counterparty_name}
                        {doc.counterparty_inn && ` • ИНН ${doc.counterparty_inn}`}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-0.5 flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      Загружен {format(new Date(doc.created_at), "d MMM yyyy", { locale: ru })}
                      {doc.doc_date && ` • Дата документа: ${format(new Date(doc.doc_date), "d MMM yyyy", { locale: ru })}`}
                    </p>
                    {doc.notes && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{doc.notes}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl gap-1"
                    onClick={async () => {
                      // Always generate fresh signed URL — file_url stored at upload time may have expired
                      const path = doc.file_path;
                      if (!path) {
                        // fallback: legacy records may only have file_url
                        if (doc.file_url) {
                          window.open(doc.file_url, "_blank");
                          return;
                        }
                        toast.error("Файл не найден");
                        return;
                      }
                      const { data, error } = await supabase.storage
                        .from("incoming-documents")
                        .createSignedUrl(path, 3600);
                      if (error || !data?.signedUrl) {
                        toast.error("Не удалось открыть файл", { description: error?.message });
                        return;
                      }
                      window.open(data.signedUrl, "_blank");
                    }}
                  >
                    <ExternalLink className="w-4 h-4" />
                    Открыть
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Переместить документ "${doc.title}" в корзину? Срок хранения 30 дней.`)) remove(doc);
                    }}
                    className="rounded-xl"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Загрузить входящий документ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Тип документа</Label>
              <Select
                value={form.doc_type}
                onValueChange={(v) => setForm({ ...form, doc_type: v as IncomingDocType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Название *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Договор оказания услуг №..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Контрагент</Label>
                <Input
                  value={form.counterparty_name}
                  onChange={(e) => setForm({ ...form, counterparty_name: e.target.value })}
                  placeholder="ООО «Ромашка»"
                />
              </div>
              <div className="space-y-1">
                <Label>ИНН контрагента</Label>
                <Input
                  value={form.counterparty_inn}
                  onChange={(e) => setForm({ ...form, counterparty_inn: e.target.value })}
                  placeholder="7707083893"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Номер документа</Label>
                <Input
                  value={form.doc_number}
                  onChange={(e) => setForm({ ...form, doc_number: e.target.value })}
                  placeholder="123/2025"
                />
              </div>
              <div className="space-y-1">
                <Label>Дата документа</Label>
                <Input
                  type="date"
                  value={form.doc_date}
                  onChange={(e) => setForm({ ...form, doc_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Файл *</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="space-y-1">
              <Label>Комментарий</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Дополнительная информация"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={uploading || !file || !form.title.trim()}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Загрузка..." : "Загрузить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
