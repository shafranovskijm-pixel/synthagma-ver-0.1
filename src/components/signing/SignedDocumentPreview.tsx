import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Download, FileText, FileDown } from "lucide-react";
import { PepSignatureStamp } from "@/components/signing/PepSignatureStamp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateSignedPdf } from "@/lib/signedDocumentPdf";
import type { AcceptedEditSummary } from "@/lib/pdfStampDrawer";
import { transliterate } from "@/utils/credentials";

async function downloadBlobFromUrl(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (e) {
    console.error("[SignedDocumentPreview] downloadBlobFromUrl failed", e);
    window.open(url, "_blank");
  }
}

function buildDownloadFilename(title: string): string {
  const ascii = transliterate((title || "document").toLowerCase())
    .replace(/[^a-z0-9_\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "document";
  return `${ascii}_signed.pdf`;
}

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
  /** HTML тело документа (уже с применёнными принятыми правками клиента). */
  documentHtml?: string | null;
  /** Если документ — загруженный файл (PDF/DOCX), путь в `external-contracts`. */
  attachedFilePath?: string | null;
  attachedFileMime?: string | null;
  /** Скан с собственноручной подписью (если signature_method = handwritten_scan). */
  handwrittenScanPath?: string | null;
  /** Кешированный путь к финальному подписанному PDF (для предварительной загрузки URL). */
  signedDocumentPath?: string | null;
  /** Подпись отправителя (организация / Оператор). */
  sender?: PartyInfo;
  /** Подпись получателя (клиент). */
  recipient?: PartyInfo;
  /** Способ подписания. */
  signatureMethod?: "pep" | "handwritten_scan";
  /** Список принятых правок — для PDF-вложений добавится отдельная страница-список. */
  acceptedEdits?: AcceptedEditSummary[];
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
  sender,
  recipient,
  signatureMethod = "pep",
  acceptedEdits,
}: Props) {
  const [attachedUrl, setAttachedUrl] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
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
    Promise.all([resolve(attachedFilePath), resolve(handwrittenScanPath)])
      .then(([a, s]) => {
        if (cancelled) return;
        setAttachedUrl(a);
        setScanUrl(s);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, attachedFilePath, handwrittenScanPath]);

  const handleDownloadPdf = async () => {
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
        acceptedEdits,
      });
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

          {!loading && attachedUrl && !documentHtml && acceptedEdits && acceptedEdits.length > 0 && (
            <div className="border rounded-lg p-4 bg-emerald-50/50 space-y-2">
              <div className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Принятые правки клиента ({acceptedEdits.length})
              </div>
              <ol className="text-xs text-emerald-900 space-y-1 list-decimal pl-5">
                {acceptedEdits.map((e, i) => (
                  <li key={e.id || i}>
                    {e.kind === "insert" && <>Вставить: «<span className="font-medium">{e.after}</span>»</>}
                    {e.kind === "delete" && <>Удалить: «<span className="line-through opacity-70">{e.before}</span>»</>}
                    {e.kind === "replace" && (
                      <>
                        Заменить «<span className="opacity-70">{e.before}</span>» на «
                        <span className="font-medium">{e.after}</span>»
                      </>
                    )}
                  </li>
                ))}
              </ol>
            </div>
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
              {generating ? "Сборка PDF…" : "Скачать подписанный PDF"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
