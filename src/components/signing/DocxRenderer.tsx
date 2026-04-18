import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  fileUrl: string;
  /** Storage path (для приватного бакета — грузим через SDK download) */
  storagePath?: string | null;
  cachedHtml?: string | null;
  revisionId?: string | null;
  onHtmlReady: (html: string) => void;
}

const EXTERNAL_BUCKET = "external-contracts";

/**
 * Скачивает DOCX-файл (через Supabase Storage или signed URL),
 * конвертирует в HTML через mammoth, кеширует на сервере.
 */
export function DocxRenderer({ fileUrl, storagePath, cachedHtml, revisionId, onHtmlReady }: Props) {
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
        setError(null);
        let arrayBuffer: ArrayBuffer | null = null;

        // 1) Если знаем storage path — грузим через SDK (надёжно для приватных бакетов)
        if (storagePath) {
          const { data, error: dlErr } = await supabase.storage
            .from(EXTERNAL_BUCKET)
            .download(storagePath);
          if (dlErr || !data) throw new Error(dlErr?.message || "Не удалось скачать файл из хранилища");
          arrayBuffer = await data.arrayBuffer();
        } else {
          // 2) Иначе — обычный fetch по URL
          const res = await fetch(fileUrl);
          if (!res.ok) throw new Error(`Не удалось скачать файл (${res.status})`);
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("text/html")) {
            throw new Error("Файл недоступен (приватная ссылка). Откройте через подписной токен.");
          }
          arrayBuffer = await res.arrayBuffer();
        }

        // Проверка валидности ZIP/DOCX (PK\x03\x04)
        const head = new Uint8Array(arrayBuffer.slice(0, 4));
        if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
          throw new Error("Файл не является валидным DOCX (повреждён или приватный URL)");
        }

        const mammoth: any = await import("mammoth/mammoth.browser");
        const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled) return;
        const wrappedHtml = `<div class="docx-content">${html}</div>`;
        onHtmlReady(wrappedHtml);

        // Кешируем (best-effort)
        if (revisionId) {
          (supabase as any).rpc("update_signature_revision_html", {
            p_revision_id: revisionId,
            p_html: wrappedHtml,
          }).then(() => {}).catch(() => {});
        }
      } catch (e: any) {
        console.error("[DocxRenderer]", e);
        if (!cancelled) setError(e.message || "Не удалось обработать DOCX");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, storagePath, revisionId]);

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
