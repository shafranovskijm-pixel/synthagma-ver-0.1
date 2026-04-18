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
    Promise.all([resolve(attachedFilePath), resolve(handwrittenScanPath)])
      .then(([a, s]) => {
        if (cancelled) return;
        setAttachedUrl(a);
        setScanUrl(s);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, attachedFilePath, handwrittenScanPath]);

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=900,height=1200");
    if (!win) {
      toast.error("Разрешите всплывающие окна, чтобы скачать PDF");
      return;
    }
    const stampHtml = (p?: PartyInfo, label?: string) => {
      if (!p?.signedAt) return "";
      const date = new Date(p.signedAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
      return `
        <div style="border:2px solid #0f8c7e;border-radius:12px;padding:16px;margin:8px;min-width:320px;background:linear-gradient(135deg,rgba(15,140,126,.08),rgba(15,140,126,.02));">
          <div style="font-weight:700;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#0f8c7e;border-bottom:1px solid rgba(15,140,126,.3);padding-bottom:6px;margin-bottom:10px;">
            ${label || "Подпись"} · ПЭП (63-ФЗ)
          </div>
          <table style="font-size:12px;width:100%;border-collapse:collapse;">
            <tr><td style="color:#666;width:110px;padding:2px 0;">ФИО:</td><td style="font-weight:600;">${p.fullName}</td></tr>
            <tr><td style="color:#666;padding:2px 0;">Email:</td><td>${p.email}</td></tr>
            <tr><td style="color:#666;padding:2px 0;">Дата:</td><td>${date} (МСК)</td></tr>
            ${p.ip ? `<tr><td style="color:#666;padding:2px 0;">IP:</td><td style="font-family:monospace;">${p.ip}</td></tr>` : ""}
            ${p.agreementId ? `<tr><td style="color:#666;padding:2px 0;">Соглашение:</td><td style="font-family:monospace;">PEP-${p.agreementId.slice(0,8).toUpperCase()}</td></tr>` : ""}
            ${p.documentHash ? `<tr><td style="color:#666;padding:2px 0;">SHA-256:</td><td style="font-family:monospace;font-size:10px;word-break:break-all;">${p.documentHash}</td></tr>` : ""}
          </table>
        </div>`;
    };
    const body = documentHtml
      ? documentHtml
      : (attachedUrl
          ? `<div style="text-align:center;padding:40px;border:1px dashed #ccc;border-radius:12px;">
              <p>Документ — вложение: <a href="${attachedUrl}" target="_blank">${documentTitle}</a></p>
              <p style="font-size:11px;color:#666;">Откройте по ссылке и распечатайте отдельно.</p>
            </div>`
          : "<p>Содержимое документа недоступно.</p>");
    const scanBlock = scanUrl
      ? `<div style="margin-top:24px;border-top:2px solid #0f8c7e;padding-top:16px;"><h3>Скан с собственноручной подписью и печатью</h3><img src="${scanUrl}" style="max-width:100%;border:1px solid #ddd;border-radius:8px;"/></div>`
      : "";
    win.document.write(`<!DOCTYPE html><html><head><title>${documentTitle}</title><meta charset="utf-8"/><style>
      body{font-family:'Times New Roman',serif;color:#111;max-width:900px;margin:24px auto;padding:24px;}
      h1,h2,h3{color:#111;}
      .stamps{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:32px;border-top:2px dashed #0f8c7e;padding-top:24px;}
      @media print {.no-print{display:none;}}
    </style></head><body>
      <div class="no-print" style="text-align:right;margin-bottom:16px;"><button onclick="window.print()" style="padding:8px 16px;background:#0f8c7e;color:#fff;border:none;border-radius:6px;cursor:pointer;">Печать / Сохранить как PDF</button></div>
      <h1 style="border-bottom:2px solid #0f8c7e;padding-bottom:8px;">${documentTitle}</h1>
      ${body}
      ${scanBlock}
      <div class="stamps">
        ${stampHtml(sender, "Подпись отправителя")}
        ${stampHtml(recipient, "Подпись получателя")}
      </div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.focus(), 200);
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
            <Button size="sm" className="gap-1.5" onClick={handlePrint}>
              <Printer className="w-4 h-4" />
              Скачать PDF / Печать
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
