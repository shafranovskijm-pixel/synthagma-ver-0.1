import { useState, useRef, DragEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, X, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  /** Email админа Синтагмы (получатель). По умолчанию подставляется из app_settings или фолбэк */
  defaultAdminEmail?: string;
  onSent?: (signatureId: string) => void;
}

const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

const FALLBACK_ADMIN_EMAIL = "support@syntagma.com.ru";

export function ExternalContractUploader({ open, onOpenChange, organizationId, defaultAdminEmail, onSent }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [adminEmail, setAdminEmail] = useState(defaultAdminEmail || "");
  const [summary, setSummary] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setTitle(""); setSummary("");
  };

  const handleFile = (f: File) => {
    if (!ALLOWED_MIME.includes(f.type) && !/\.(pdf|docx?|)$/i.test(f.name)) {
      toast.error("Только PDF или DOCX/DOC");
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error("Файл больше 20 МБ");
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.(pdf|docx?|)$/i, ""));
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const send = async () => {
    if (!file || !title.trim()) {
      toast.error("Загрузите файл и укажите название");
      return;
    }
    const recipientEmail = adminEmail.trim() || FALLBACK_ADMIN_EMAIL;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${organizationId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("external-contracts")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("external-contracts").getPublicUrl(path);
      // Bucket is private; URL won't work directly, but signed URLs will be generated in admin view.
      // We store the storage path (object key) in file_url for signing later.

      const { data: sigId, error: rpcErr } = await (supabase as any).rpc("create_external_contract_signature", {
        p_file_url: path, // store path, not public URL (bucket is private)
        p_file_name: file.name,
        p_file_mime: file.type || "application/octet-stream",
        p_document_title: title.trim(),
        p_admin_email: adminEmail.trim(),
        p_admin_name: "Администратор Синтагма",
        p_summary: summary.trim() || null,
      });
      if (rpcErr) throw rpcErr;

      toast.success("Договор отправлен на согласование", {
        description: "Администратор Синтагмы получит уведомление",
      });
      onSent?.(sigId as string);
      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Не удалось отправить", { description: e?.message || String(e) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!uploading) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            Загрузить свой договор
          </DialogTitle>
          <DialogDescription>
            Загрузите PDF или DOCX-договор для согласования с администратором Синтагмы. После правок документ вернётся вам, и обе стороны смогут его подписать ПЭП.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              file && "border-emerald-500/40 bg-emerald-500/5"
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {file ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-left min-w-0">
                  <FileText className="w-8 h-8 text-emerald-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} МБ</div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-medium">Перетащите файл или кликните</div>
                <div className="text-xs text-muted-foreground mt-1">PDF или DOCX, до 20 МБ</div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ec-title">Название договора</Label>
            <Input id="ec-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Договор оказания услуг..." />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ec-admin">Email администратора Синтагмы</Label>
            <Input id="ec-admin" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@sintagma.com.ru" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ec-summary">Комментарий (необязательно)</Label>
            <Textarea id="ec-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Просим согласовать договор..." rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Отмена</Button>
          <Button onClick={send} disabled={!file || !title.trim() || !adminEmail.trim() || uploading} className="gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Отправить на согласование
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
