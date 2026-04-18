import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, X, FileSignature, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  signatureId: string;
  organizationId: string;
  signatureToken: string;
  /** ФИО подписанта — записывается в финализатор для штампа. */
  signerName: string;
  signerEmail: string;
  onSigned: (info: { signedAt: string; ip: string; pepAgreementId: string; scanPath: string }) => void;
  disabled?: boolean;
}

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const BUCKET = "external-contracts";

export function HandwrittenSignUploader({
  signatureId,
  organizationId,
  signatureToken,
  signerName,
  signerEmail,
  onSigned,
  disabled,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      toast.error("Поддерживаются PDF, JPG или PNG");
      return;
    }
    if (f.size > 25 * 1024 * 1024) {
      toast.error("Файл больше 25 МБ");
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file || !signerName.trim() || !signerEmail.trim()) {
      toast.error("Заполните ФИО, email и выберите файл");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${organizationId}/signed-scans/${signatureId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("finalize-signature", {
        body: {
          token: signatureToken,
          method: "handwritten_scan",
          handwrittenScanPath: path,
          handwrittenScanComment: comment.trim() || null,
          documentHash: "handwritten_scan",
          pepAgreement: {
            agreement_text: "Подпись поставлена путём загрузки скана с собственноручной подписью и печатью.",
            agreement_version: "scan-v1.0",
            full_name: signerName,
            email: signerEmail,
          },
        },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Ошибка сохранения");
      }
      onSigned({
        signedAt: (data as any).signedAt,
        ip: (data as any).ip,
        pepAgreementId: (data as any).pepAgreementId,
        scanPath: path,
      });
      toast.success("Подписанный скан загружен");
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Не удалось загрузить");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Распечатайте документ, поставьте подпись и печать, отсканируйте и загрузите PDF или фото.
        Файл будет приложен к договору как итоговая подписанная версия.
      </p>

      {!file ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 rounded-lg p-6 text-center transition-colors"
          disabled={disabled || uploading}
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <div className="text-sm font-medium">Выбрать файл</div>
          <div className="text-[11px] text-muted-foreground mt-1">PDF, JPG или PNG, до 25 МБ</div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border bg-background p-3">
          <FileText className="w-5 h-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{file.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(2)} МБ
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setFile(null)}
            disabled={uploading}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-[11px]">Комментарий (необязательно)</Label>
        <Textarea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например: подписал генеральный директор."
          className="text-xs"
          disabled={uploading}
        />
      </div>

      <Button
        className="w-full gap-1.5"
        size="sm"
        onClick={handleSubmit}
        disabled={!file || uploading || disabled || !signerName.trim() || !signerEmail.trim()}
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
        {uploading ? "Загрузка…" : "Прикрепить и подписать"}
      </Button>
    </div>
  );
}
