import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  fileUrl: string;
  cachedHtml?: string | null;
  revisionId?: string | null;
  onHtmlReady: (html: string) => void;
}

/**
 * Скачивает DOCX-файл, конвертирует в HTML через mammoth (динамический импорт),
 * кеширует результат на сервере (RPC update_signature_revision_html).
 */
export function DocxRenderer({ fileUrl, cachedHtml, revisionId, onHtmlReady }: Props) {
  const [loading, setLoading] = useState(!cachedHtml);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cachedHtml) {
      onHtmlReady(cachedHtml);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`Не удалось скачать файл (${res.status})`);
        const arrayBuffer = await res.arrayBuffer();
        const mammoth: any = await import("mammoth/mammoth.browser");
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled) return;
        const wrappedHtml = `<div class="docx-content">${html}</div>`;
        onHtmlReady(wrappedHtml);
        // Кешируем на сервере (best-effort)
        if (revisionId) {
          (supabase as any).rpc("update_signature_revision_html", {
            p_revision_id: revisionId,
            p_html: wrappedHtml,
          }).then(() => {}).catch(() => {});
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Не удалось обработать DOCX");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, revisionId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Конвертация документа…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-destructive gap-2">
        <AlertTriangle className="w-6 h-6" />
        <p className="text-sm">{error}</p>
        <a href={fileUrl} target="_blank" rel="noreferrer" className="text-xs underline text-primary">
          Скачать файл
        </a>
      </div>
    );
  }
  return null;
}
