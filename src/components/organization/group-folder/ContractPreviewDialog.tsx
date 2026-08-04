import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileDown, FileText, AlertTriangle, Building2, User } from "lucide-react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadContractPdfObjectUrl,
  revokeObjectUrl,
} from "@/lib/contracts/contractPreview";
import type { GroupContractRow } from "@/hooks/useGroupContracts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: GroupContractRow | null;
  /** Скачать сохранённый PDF (тот же путь/авторизация, что и в таблице). */
  onDownloadPdf: (contract: GroupContractRow) => void;
  /** Собрать и скачать DOCX из body_html. */
  onDownloadDocx: (contract: GroupContractRow) => void;
  /** Инъекция клиента для тестов. */
  client?: any;
}

/**
 * Диалог предпросмотра договора: авторитетный источник — сохранённый PDF
 * из приватного бакета, отрисованный через object URL в <iframe>.
 */
export function ContractPreviewDialog({
  open,
  onOpenChange,
  contract,
  onDownloadPdf,
  onDownloadDocx,
  client,
}: Props) {
  const db = client ?? supabase;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filePath = contract?.file_path || contract?.file_url || null;
  const hasPdf = !!filePath;
  const counterparty = contract?.company_name || contract?.student_name || "—";
  const isLegal = contract?.counterparty_type === "legal";

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    if (!open || !filePath) {
      setObjectUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = await loadContractPdfObjectUrl(db, filePath);
        created = url;
        if (cancelled) {
          revokeObjectUrl(url);
          return;
        }
        setObjectUrl(url);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Не удалось загрузить документ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      revokeObjectUrl(created);
      setObjectUrl(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filePath]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border space-y-1 text-left">
          <DialogTitle className="text-base font-medium pr-8 truncate">
            {contract?.contract_number ? `№ ${contract.contract_number} — ` : ""}
            {contract?.name || "Договор"}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5 text-xs">
            {isLegal ? <Building2 className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
            <span className="truncate">{counterparty}</span>
          </DialogDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!hasPdf}
              aria-label="Скачать PDF"
              onClick={() => contract && onDownloadPdf(contract)}
            >
              <Download className="w-3.5 h-3.5" /> PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!contract?.body_html}
              aria-label="Скачать DOCX"
              onClick={() => contract && onDownloadDocx(contract)}
            >
              <FileDown className="w-3.5 h-3.5" /> DOCX
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} aria-label="Закрыть предпросмотр">
              Закрыть
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 relative overflow-hidden bg-muted/30">
          {!hasPdf ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Предпросмотр недоступен</p>
              <p className="text-xs text-muted-foreground">
                Для этого договора не сохранён PDF-файл. Доступные форматы — в кнопках выше.
              </p>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-sm">Загрузка документа…</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
              <AlertTriangle className="w-10 h-10 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          ) : objectUrl ? (
            <iframe
              src={objectUrl}
              title={`Предпросмотр: ${contract?.name || "договор"}`}
              className="w-full h-full border-0"
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
