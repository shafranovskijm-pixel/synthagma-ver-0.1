import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, FileText, FileDown } from "lucide-react";
import { PepSignatureStamp } from "@/components/signing/PepSignatureStamp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateSignedPdf, getCachedSignedPdfUrl } from "@/lib/signedDocumentPdf";

interface PartyInfo {
  fullName: string;
  email: string;
  signedAt: string | null;
  ip?: string | null;
  agreementId?: string | null;
  documentHash?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signatureId: string;
  documentTitle: string;
  /** HTML тело документа (если HTML-договор). */
  documentHtml?: string | null;
  /** Если документ — загруженный файл (PDF/DOCX), путь в `external-contracts`. */
  attachedFilePath?: string | null;
  attachedFileMime?: string | null;
  /** Скан с собственноручной подписью (если signature_method = handwritten_scan). */
  handwrittenScanPath?: string | null;
  /** Кешированный путь к финальному подписанному PDF. */
  signedDocumentPath?: string | null;
  /** Подпись отправителя (организация / Оператор). */
  sender?: PartyInfo;
  /** Подпись получателя (клиент). */
  recipient?: PartyInfo;
  /** Способ подписания. */
  signatureMethod?: "pep" | "handwritten_scan";
}

const BUCKET = "external-contracts";

export function SignedDocumentPreview({
  open,
  onOpenChange,
  signatureId,
  documentTitle,
  documentHtml,
  attachedFilePath,
  attachedFileMime,
  handwrittenScanPath,
  signedDocumentPath,
  sender,
  recipient,
  signatureMethod = "pep",
}: Props) {
  const [attachedUrl, setAttachedUrl] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [cachedPdfUrl, setCachedPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const resolve = async (path: string | null | undefined): Promise<string | null> => {
      if (!path) return null;
      if (path.startsWith("http://") || path.startsWith("https://")) return path;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      if (error) {
        console.error("[SignedDocumentPreview] signed URL error", error);
        return null;
      }
      return data?.signedUrl || null;
    };
    setLoading(true);
    Promise.all([
      resolve(attachedFilePath),
      resolve(handwrittenScanPath),
      getCachedSignedPdfUrl(signedDocumentPath),
    ])
      .then(([a, s, cached]) => {
        if (cancelled) return;
        setAttachedUrl(a);
        setScanUrl(s);
        setCachedPdfUrl(cached);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, attachedFilePath, handwrittenScanPath, signedDocumentPath]);

  const handleDownloadPdf = async () => {
    if (cachedPdfUrl) {
      window.open(cachedPdfUrl, "_blank");
      return;
    }
    setGenerating(true);
    try {
      const result = await generateSignedPdf({
        signatureId,
        documentTitle,
        documentHtml: documentHtml || null,
        attachedFileUrl: attachedUrl,
        attachedFileMime: attachedFileMime || null,
        scanFileUrl: scanUrl,
        scanFileMime: attachedFileMime || null,
        signatureMethod,
        sender,
        recipient,
      });
      setCachedPdfUrl(result.url);
      if (result.url) {
        window.open(result.url, "_blank");
        toast.success("Подписанный PDF готов");
      }
    } catch (e: any) {
      console.error("[SignedDocumentPreview] generateSignedPdf error", e);
      toast.error("Не удалось собрать PDF: " + (e?.message || "ошибка"));
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadAttachment = () => {
    const url = scanUrl || attachedUrl;
    if (!url) return;
    window.open(url, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Подписанный документ: {documentTitle}
            <Badge variant="outline" className="ml-2 text-[10px]">
              {signatureMethod === "handwritten_scan" ? "Скан с подписью и печатью" : "ПЭП (63-ФЗ)"}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Загрузка документа…</span>
            </div>
          )}

          {!loading && documentHtml && (
            <div
              className="border rounded-lg p-6 bg-white prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: documentHtml }}
            />
          )}

          {!loading && attachedUrl && !documentHtml && (
            <iframe
              src={attachedUrl}
              className="w-full h-[60vh] border rounded-lg bg-white"
              title={documentTitle}
            />
          )}

          {!loading && scanUrl && (
            <div className="space-y-2">
              <div className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Скан с собственноручной подписью и печатью
              </div>
              {scanUrl.toLowerCase().includes(".pdf") || attachedFileMime?.includes("pdf") ? (
                <iframe src={scanUrl} className="w-full h-[60vh] border rounded-lg bg-white" />
              ) : (
                <img src={scanUrl} alt="Подписанный скан" className="w-full max-h-[60vh] object-contain border rounded-lg bg-white" />
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
            {sender?.signedAt && (
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                  Отправитель (Оператор)
                </div>
                <PepSignatureStamp
                  fullName={sender.fullName}
                  email={sender.email}
                  signedAt={sender.signedAt}
                  ip={sender.ip || null}
                  documentHash={sender.documentHash || null}
                  agreementId={sender.agreementId || null}
                />
              </div>
            )}
            {recipient?.signedAt && (
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                  Получатель
                </div>
                <PepSignatureStamp
                  fullName={recipient.fullName}
                  email={recipient.email}
                  signedAt={recipient.signedAt}
                  ip={recipient.ip || null}
                  documentHash={recipient.documentHash || null}
                  agreementId={recipient.agreementId || null}
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-t p-4 flex items-center justify-between gap-2 bg-muted/30">
          <div className="text-[11px] text-muted-foreground hidden sm:block">
            Подписи имеют юридическую силу, равную собственноручной (ст. 6 63-ФЗ).
          </div>
          <div className="flex gap-2 ml-auto">
            {(attachedUrl || scanUrl) && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownloadAttachment}>
                <Download className="w-4 h-4" />
                Скачать вложение
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={handleDownloadPdf} disabled={generating}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {cachedPdfUrl ? "Скачать подписанный PDF" : (generating ? "Сборка PDF…" : "Сформировать PDF")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
