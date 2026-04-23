import { useState, useRef, DragEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, X, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signatureId: string;
  organizationId: string;
  /** Заголовок диалога — например, "Отправить правленую версию" или "Загрузить новую версию" */
  title?: string;
  onUploaded?: (revisionId: string) => void;
}

const ALLOWED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword"];
const MAX_SIZE = 20 * 1024 * 1024;

export function SignatureRevisionUploader({ open, onOpenChange, signatureId, organizationId, title = "Загрузить новую версию", onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!ALLOWED.includes(f.type) && !/\.(pdf|docx?|)$/i.test(f.name)) { toast.error("Только PDF или DOCX/DOC"); return; }
    if (f.size > MAX_SIZE) { toast.error("Файл больше 20 МБ"); return; }
    setFile(f);
  };

  const send = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${organizationId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("external-contracts").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: revId, error: rpcErr } = await (supabase as any).rpc("add_signature_revision", {
        p_signature_id: signatureId,
        p_file_url: path,
        p_file_name: file.name,
        p_file_mime: file.type || "application/octet-stream",
        p_document_html: null,
        p_change_summary: summary.trim() || null,
      });
      if (rpcErr) throw rpcErr;

      toast.success("Новая версия загружена", { description: "Встречная сторона получит уведомление" });
      onUploaded?.(revId as string);
      setFile(null); setSummary("");
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error("Не удалось загрузить", { description: getErrorMessage(e) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!uploading) onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload className="w-5 h-5 text-primary" />{title}</DialogTitle>
          <DialogDescription>Загрузите отредактированный документ. Встречная сторона увидит вашу версию и сможет принять её или предложить новые правки.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors",
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
              file && "border-emerald-500/40 bg-emerald-500/5"
            )}
          >
            <input ref={inputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {file ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-left min-w-0">
                  <FileText className="w-7 h-7 text-emerald-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} МБ</div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setFile(null); }}><X className="w-4 h-4" /></Button>
              </div>
            ) : (
              <>
                <Upload className="w-9 h-9 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-medium">Перетащите файл или кликните</div>
                <div className="text-xs text-muted-foreground mt-1">PDF или DOCX, до 20 МБ</div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>Что изменилось (необязательно)</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="Внесены правки в пп. 3.2, 5.1..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>Отмена</Button>
          <Button onClick={send} disabled={!file || uploading} className="gap-2">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Отправить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
