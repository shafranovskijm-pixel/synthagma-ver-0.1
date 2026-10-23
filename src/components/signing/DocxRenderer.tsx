import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { captureSignatureRead, signatureAuthorization, type SignatureReadOptions } from '@/lib/signatureClientScope';

interface Props {
  fileUrl: string;
  /** Storage path (для приватного бакета — грузим через SDK download) */
  storagePath?: string | null;
  cachedHtml?: string | null;
  revisionId?: string | null;
  cacheConvertedHtml?: boolean;
  onDownload?: () => void;
  onHtmlReady: (html: string) => void;
  readOptions?: SignatureReadOptions;
}

const EXTERNAL_BUCKET = "external-contracts";

/**
 * Скачивает DOCX-файл (через Supabase Storage или signed URL),
 * конвертирует в HTML через mammoth, кеширует на сервере.
 */
export function DocxRenderer({ fileUrl, storagePath, cachedHtml, revisionId, cacheConvertedHtml = true, onDownload, onHtmlReady, readOptions }: Props) {
  const [loading, setLoading] = useState(!cachedHtml);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    const abort = () => controller.abort();
    if (readOptions?.signal?.aborted) abort();
    else readOptions?.signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => { cancelled = true; controller.abort(); readOptions?.signal?.removeEventListener('abort', abort); };
    const read = captureSignatureRead({ ...readOptions, signal: controller.signal });
    if (cachedHtml) {
      try { read.active(); onHtmlReady(cachedHtml); } catch { /* stale cached view */ }
      return cleanup;
    }
    (async () => {
      try {
        setLoading(true);
        setError(null);
        let arrayBuffer: ArrayBuffer | null = null;

        // 1) Если знаем storage path — грузим через SDK (надёжно для приватных бакетов)
        if (storagePath) {
          if (readOptions) throw new Error('Для файла требуется актуальная подписанная ссылка.');
          const { data, error: dlErr } = await supabase.storage
            .from(EXTERNAL_BUCKET)
            .download(storagePath);
          if (dlErr || !data) throw new Error(dlErr?.message || "Не удалось скачать файл из хранилища");
          arrayBuffer = await data.arrayBuffer();
        } else {
          // 2) Иначе — обычный fetch по URL
          read.active(); const res = await read.wait(fetch(fileUrl, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }));
          if (!res.ok) throw new Error(`Не удалось скачать файл (${res.status})`);
          const ct = res.headers.get("content-type") || "";
          if (ct.includes("text/html")) {
            throw new Error("Файл недоступен (приватная ссылка). Откройте через подписной токен.");
          }
          arrayBuffer = await read.wait(res.arrayBuffer());
        }

        // Проверка валидности ZIP/DOCX (PK\x03\x04)
        const head = new Uint8Array(arrayBuffer.slice(0, 4));
        if (!(head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)) {
          throw new Error("Файл не является валидным DOCX (повреждён или приватный URL)");
        }

        const mammoth: any = await read.wait(import("mammoth/mammoth.browser"));
        read.active(); const { value: html } = await read.wait<any>(mammoth.convertToHtml({ arrayBuffer }));
        if (cancelled) return;
        read.active();
        const wrappedHtml = `<div class="docx-content">${html}</div>`;
        // Кешируем (best-effort)
        if (revisionId && cacheConvertedHtml) {
          try {
            const { bearer } = await signatureAuthorization(read); read.active();
            await read.wait((supabase as any).rpc("update_signature_revision_html", {
              p_revision_id: revisionId,
              p_html: wrappedHtml,
            }).setHeader('Authorization', bearer));
          } catch { read.active(); /* A failed optional cache cannot become a stale read. */ }
        }
        read.active(); if (!cancelled) onHtmlReady(wrappedHtml);
      } catch (e: any) {
        try { readOptions?.assertCurrent?.(); if (!cancelled) setError(e.message || "Не удалось обработать DOCX"); } catch { /* stale view */ }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl, storagePath, revisionId, cacheConvertedHtml]);

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
        <a href={fileUrl} onClick={onDownload ? e => { e.preventDefault(); onDownload(); } : undefined} target="_blank" rel="noreferrer" className="text-xs underline text-primary">
          Скачать файл
        </a>
      </div>
    );
  }
  return null;
}
