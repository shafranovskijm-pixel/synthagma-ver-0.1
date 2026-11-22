import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditorialWorkspace } from "@/api/rtn-editorial";
import { isRtnManualImportCapability, isRtnSourceImportDescriptor, officialSourceUploadUrl, RtnSourceUploadError, uploadRtnOfficialFile, type RtnSourceUploadReceipt, type RtnSourceUploadRequest } from "@/api/rtn-source-upload";

const field = "min-h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm";
function receivedDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(value));
}

/** Mounted inside the actual-admin panel even while that panel is collapsed. */
export function RtnOfficialFileUpload({ workspace, showTrigger, disabled, onAccepted, onRefresh }: {
  workspace?: EditorialWorkspace; showTrigger: boolean; disabled: boolean;
  onAccepted: (receipt: RtnSourceUploadReceipt) => Promise<void> | void; onRefresh: () => Promise<unknown> | void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false), [sourceId, setSourceId] = useState("");
  const [publicationPageUrl, setPublicationPageUrl] = useState(""), [documentUrl, setDocumentUrl] = useState("");
  const [file, setFile] = useState<File | null>(null), [attested, setAttested] = useState(false), [inputVersion, setInputVersion] = useState(0);
  const [pending, setPending] = useState(false), [error, setError] = useState<RtnSourceUploadError | null>(null);
  const [receipt, setReceipt] = useState<RtnSourceUploadReceipt | null>(null), [refreshFailed, setRefreshFailed] = useState(false);
  const alive = useRef(false), inFlight = useRef(false), requestRef = useRef<RtnSourceUploadRequest | null>(null), abortRef = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; abortRef.current?.abort(); }; }, []);
  const sources = (workspace?.sources || []).filter(isRtnSourceImportDescriptor);
  const source = sources.find(item => item.id === sourceId);
  const capability = workspace?.manual_source_import_capability;
  const uncertain = error?.uncertain === true;
  const locked = pending || uncertain || !!receipt;
  const canSend = !disabled && !pending && !receipt && error?.code !== "historical" && (uncertain || !!source && !!file && attested && !!officialSourceUploadUrl(publicationPageUrl) && !!officialSourceUploadUrl(documentUrl));

  function reset() {
    requestRef.current = null; setError(null); setReceipt(null); setFile(null); setAttested(false); setRefreshFailed(false); setInputVersion(value => value + 1);
  }
  async function refreshSource() {
    try { await onRefresh(); if (alive.current) setRefreshFailed(false); }
    catch { if (alive.current) setRefreshFailed(true); }
  }
  async function submit() {
    if (inFlight.current || !canSend) return;
    const request = requestRef.current || (source && file ? {
      file, parser: source.parser, metadata: {
        sourceId: source.id, intakeRequestId: crypto.randomUUID(), expectedSourceGeneration: source.source_generation,
        publicationPageUrl: officialSourceUploadUrl(publicationPageUrl)!, documentUrl: officialSourceUploadUrl(documentUrl)!,
        attestationVersion: "official-current-location-v1" as const,
      },
    } : null);
    if (!request) return;
    requestRef.current = request; inFlight.current = true; setPending(true); setError(null);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const value = await uploadRtnOfficialFile(request, controller.signal);
      if (!alive.current || requestRef.current !== request) return;
      setReceipt(value);
      try { await onAccepted(value); } catch { if (alive.current) setRefreshFailed(true); }
    } catch (caught) {
      if (!alive.current || requestRef.current !== request) return;
      const failure = caught instanceof RtnSourceUploadError ? caught : new RtnSourceUploadError("unavailable", "Результат загрузки не подтверждён. Повторите ту же загрузку.", true);
      setError(failure);
      if (!failure.uncertain) requestRef.current = null;
    } finally {
      inFlight.current = false; if (alive.current) setPending(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }
  if (!showTrigger || !isRtnManualImportCapability(capability)) return null;
  return <>
    <Button variant="outline" className="mt-3 h-auto min-h-11 max-w-full gap-2 whitespace-normal text-left" disabled={disabled} onClick={() => setOpen(true)}><Upload className="h-4 w-4 shrink-0" />Загрузить официальный файл</Button>
    <Dialog open={open} onOpenChange={value => { if (!inFlight.current) setOpen(value); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-xl overflow-y-auto p-4 sm:p-6" onEscapeKeyDown={event => { if (inFlight.current) event.preventDefault(); }} onInteractOutside={event => { if (inFlight.current) event.preventDefault(); }}>
        <DialogHeader><DialogTitle className="break-words pr-5">Загрузить официальный файл</DialogTitle><DialogDescription>Оригинал PDF или XLSX сохранится приватно. Загрузка файла не заменяет предметную проверку ответов и не означает, что автопроверка сайта заработала.</DialogDescription></DialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="space-y-1"><label htmlFor={`${id}-source`} className="text-sm">Официальный источник</label><select id={`${id}-source`} className={field} value={sourceId} disabled={locked || disabled} onChange={event => {
            const next = sources.find(item => item.id === event.target.value); setSourceId(event.target.value); reset(); setPublicationPageUrl(next?.page_url || ""); setDocumentUrl(next?.document_url || "");
          }}><option value="">Выберите источник</option>{sources.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
          {!sources.length && <p role="status" className="text-sm text-muted-foreground">Нет подтверждённых источников для загрузки. Обновите сведения.</p>}
          <div className="space-y-1"><label htmlFor={`${id}-page`} className="text-sm">Страница официальной публикации</label><input id={`${id}-page`} type="url" className={field} value={publicationPageUrl} disabled={locked || disabled || !source} onChange={event => { setPublicationPageUrl(event.target.value); setAttested(false); setError(null); }} /></div>
          <div className="space-y-1"><label htmlFor={`${id}-document`} className="text-sm">Ссылка на оригинал на сайте Ростехнадзора</label><input id={`${id}-document`} type="url" className={field} value={documentUrl} disabled={locked || disabled || !source} onChange={event => { setDocumentUrl(event.target.value); setAttested(false); setError(null); }} /></div>
          <div className="min-w-0 space-y-1"><label htmlFor={`${id}-file`} className="text-sm">Оригинал файла</label><input key={`${sourceId}:${inputVersion}`} id={`${id}-file`} type="file" className={`${field} h-auto overflow-hidden`} accept={source?.parser === "industrial-pdf" ? ".pdf,application/pdf" : ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"} disabled={locked || disabled || !source} aria-describedby={`${id}-limit`} onChange={event => { setFile(event.target.files?.[0] || null); setAttested(false); setError(null); }} /><p id={`${id}-limit`} className="text-xs text-muted-foreground">{source?.parser === "industrial-pdf" ? "PDF" : "XLSX"}, не больше 16 МБ. Дата получения файла системой сохранится автоматически.</p></div>
          <div className="flex items-start gap-3"><input id={`${id}-attestation`} type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={attested} disabled={locked || disabled || !file} onChange={event => setAttested(event.target.checked)} /><label htmlFor={`${id}-attestation`} className="text-sm">Файл получен из указанной публикации Ростехнадзора; её актуальное расположение сверено.</label></div>
          {pending && <p role="status" className="text-sm text-muted-foreground">Проверяем и сохраняем оригинал. Дождитесь квитанции.</p>}
          {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error.message}</p>{uncertain && <p className="text-xs text-muted-foreground">Файл и параметры сохранены для повтора с тем же номером запроса.</p>}{error.code === "conflict" && <Button variant="outline" disabled={disabled || pending} onClick={() => void refreshSource()}>Обновить сведения об источнике</Button>}</div>}
          {refreshFailed && !receipt && <p role="alert" className="text-sm text-destructive">Не удалось обновить сведения об источнике. Загрузка повторно не запускалась.</p>}
          {receipt && <div role="status" className="min-w-0 space-y-2 rounded-xl border border-border p-3 text-sm">
            <p className="font-medium">Официальный оригинал сохранён.</p><p>Файл загружен администратором: {receivedDate(receipt.received_at)} МСК.</p>
            {receipt.replayed && <p className="text-xs text-muted-foreground">Показана уже сохранённая квитанция. Дата оригинала не обновлялась.</p>}
            {!receipt.still_current ? <p>Редакция источника уже изменилась. Этот оригинал сохранён в истории.</p> : <p>{receipt.normalization_required ? "Формулировки ещё нужно извлечь и проверить." : "Формулировки извлечены; учебные ответы и выпуск проверяются отдельно."}</p>}
            <p className="text-xs text-muted-foreground">Дата автоматической проверки сайта не изменена. Старые курсы, попытки и результаты сохранены.</p>
            {refreshFailed && <p className="text-xs text-destructive">Оригинал сохранён, но список редакций пока не обновился. Обновите сведения.</p>}
            <Button variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={reset}>Добавить другой оригинал</Button>
          </div>}
        </div>
        <DialogFooter><Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Закрыть</Button><Button className="h-auto min-h-11 gap-2 whitespace-normal" disabled={!canSend} onClick={() => void submit()}>{pending && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}{uncertain ? "Повторить ту же загрузку" : "Загрузить оригинал"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
