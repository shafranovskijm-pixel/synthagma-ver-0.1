import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { courseDocumentPreview } from "@/lib/courseDocumentPreview";
import { useAuth } from "@/hooks/useAuth";
import { PLATFORM_REVIEW_ORG_ID } from "@/lib/platformCoursePublication";
import { useCourseExactFileDelivery } from "@/hooks/useCourseExactFileDelivery";
import { useCourseFileDeliveryMode } from "@/hooks/useCourseFileDeliveryMode";
import { VerifiedPdfCanvas } from "./VerifiedPdfCanvas";
import { isOpaqueCourseFileLocator, type CourseFilePreviewReference, type CourseFileModeContext } from "@/lib/courseFileConsumer";
import type { CourseFileAccessMode, CourseFilePurpose, LegacyCourseFileDelivery } from "@/lib/courseExactFileDelivery";
import { captureOfflineAuthRevision, captureOfflineContext, subscribeOfflineAuthRevision } from "@/utils/courseCache";

export interface FilePreviewDialogProps {
  readonly open: boolean; readonly onOpenChange: (open: boolean) => void;
  readonly reference: CourseFilePreviewReference; readonly accessMode: CourseFileAccessMode;
  readonly effectiveUserId?: string | null; readonly allowDownload: boolean;
  readonly initialPurpose?: CourseFilePurpose;
  readonly resolveLegacyUrl?: (signal: AbortSignal, context: LegacyCourseFileDelivery) => Promise<string | null>;
}
interface LegacyPreviewProps { open: boolean; onOpenChange: (open: boolean) => void; fileUrl: string; fileName: string; fileType: string | null; allowDownload: boolean; onDownload: () => void; downloadOnly: boolean }
function checkedLegacyUrl(value: string | null): string | null {
  if (!value || isOpaqueCourseFileLocator(value)) return null;
  try { const url = new URL(value, window.location.origin); return ["https:", "http:", "blob:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function FilePreviewDialog(props: FilePreviewDialogProps) {
  const { user, userRole } = useAuth();
  const revision = useSyncExternalStore(subscribeOfflineAuthRevision, captureOfflineAuthRevision, captureOfflineAuthRevision);
  const r = props.reference;
  const key = JSON.stringify([props.open, user?.id, revision, r.courseId, r.organizationId, r.referenceKind, r.referenceId, r.versionKey, r.legacyUrl, r.name, r.fileType, props.accessMode, props.effectiveUserId, props.initialPurpose]);
  const viewRef = useRef({ key });
  if (viewRef.current.key !== key) viewRef.current = { key };
  const view = viewRef.current;
  return <BoundFilePreviewDialog key={key} {...props} actorId={user?.id || null} authRevision={revision} isCurrentView={() => viewRef.current === view} sourceReviewAvailable={userRole === "admin" && props.accessMode === "staff_preview" && r.organizationId === PLATFORM_REVIEW_ORG_ID} />;
}
function BoundFilePreviewDialog(props: FilePreviewDialogProps & { actorId: string | null; authRevision: number; isCurrentView: () => boolean; sourceReviewAvailable: boolean }) {
  const { reference: r, actorId, authRevision, open, allowDownload } = props;
  const effectiveUserId = props.effectiveUserId === undefined ? actorId : props.effectiveUserId;
  const [purpose, setPurpose] = useState<CourseFilePurpose>(props.initialPurpose || "preview");
  const [downloadSerial, setDownloadSerial] = useState(0);
  const operationRef = useRef({ purpose, downloadSerial });
  if (operationRef.current.purpose !== purpose || operationRef.current.downloadSerial !== downloadSerial) operationRef.current = { purpose, downloadSerial };
  const operation = operationRef.current;
  const mounted = useRef(true);
  const pendingDownload = useRef<typeof operation | null>(props.initialPurpose === "download" ? operation : null);
  const [legacy, setLegacy] = useState<{ operation: typeof operation; refContext: LegacyCourseFileDelivery; modeContext: CourseFileModeContext; url: string } | null>(null);
  const mode = useCourseFileDeliveryMode({ courseId: r.courseId, organizationId: r.organizationId, effectiveUserId, accessMode: props.accessMode }, open);
  const scope = actorId ? { actorId, authRevision, effectiveUserId: effectiveUserId || "", organizationId: r.organizationId, courseId: r.courseId, referenceKind: r.referenceKind, referenceId: r.referenceId, accessMode: props.accessMode, purpose } : null;
  const modePermitsRefRead = mode.view.state === "legacy" || (mode.view.state === "frozen_required" && mode.view.context.cohort !== null);
  const exact = useCourseExactFileDelivery(scope, open && modePermitsRefRead && (purpose !== "download" || allowDownload));
  const refContext = exact.view.state === "legacy" ? exact.view.context : null;
  const modeContext = mode.view.state === "legacy" ? mode.view.context : null;
  const authorityRef = useRef({ operation, refContext, modeContext }); authorityRef.current = { operation, refContext, modeContext };
  const currentActor = () => props.isCurrentView() && mounted.current && captureOfflineContext()?.actorId === actorId && captureOfflineAuthRevision() === authRevision && effectiveUserId === actorId;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const abort = new AbortController();
    if (!open || !refContext || !modeContext || isOpaqueCourseFileLocator(r.legacyUrl)) return () => abort.abort();
    const authority = authorityRef.current;
    void (async () => {
      try {
        const raw = props.resolveLegacyUrl ? await props.resolveLegacyUrl(abort.signal, refContext) : r.legacyUrl;
        const url = checkedLegacyUrl(raw);
        if (url && !abort.signal.aborted && currentActor() && authorityRef.current.operation === authority.operation
          && authorityRef.current.refContext === authority.refContext && authorityRef.current.modeContext === authority.modeContext) setLegacy({ operation, refContext, modeContext, url });
      } catch { /* A denied/failed legacy resolution stays unavailable. */ }
    })();
    return () => abort.abort();
    // Resolution occurs only after both literal server decisions; response scope is checked synchronously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, operation, refContext, modeContext]);
  const legacyUrl = refContext && modeContext && legacy?.operation === operation && legacy.refContext === refContext && legacy.modeContext === modeContext ? legacy.url : null;
  const cohort = mode.view.state === "frozen_required" ? mode.view.context.cohort : null;
  const candidateLease = exact.view.state === "exact" ? exact.view.lease : null;
  const cohortMatches = !!candidateLease && !!cohort && candidateLease.binding.copy_generation_id === cohort.copy_generation_id
    && candidateLease.binding.publication_id === cohort.publication_id && candidateLease.binding.publication_manifest_sha256 === cohort.publication_manifest_sha256
    && candidateLease.binding.source_course_id === cohort.source_course_id;
  const fileLease = cohortMatches ? candidateLease : null;
  useEffect(() => { if (candidateLease && !cohortMatches) candidateLease.release(); }, [candidateLease, cohortMatches]);
  // A cohort mismatch, malformed/missing mode, URN or RPC error never opens a live locator.
  const url = fileLease?.url || legacyUrl;
  useEffect(() => {
    if (!open || purpose !== "download" || !allowDownload || pendingDownload.current !== operation || !url || !currentActor()) return;
    pendingDownload.current = null;
    const link = document.createElement("a"); link.href = url; link.download = fileLease?.binding.display_name || r.name; link.rel = "noopener noreferrer";
    document.body.appendChild(link); link.click(); link.remove();
    // The active gateway lease stays owned until close/scope/focus invalidation, not a timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purpose, allowDownload, operation, url]);
  const download = () => {
    if (!open || !allowDownload || operationRef.current !== operation || !currentActor()) return;
    mode.refresh(); exact.refresh();
    const next = { purpose: "download" as const, downloadSerial: downloadSerial + 1 };
    operationRef.current = next; pendingDownload.current = next;
    setPurpose("download"); setDownloadSerial(next.downloadSerial);
  };
  if (legacyUrl) return <LegacyFilePreviewContent open={open} onOpenChange={props.onOpenChange} fileUrl={legacyUrl} fileName={r.name} fileType={r.fileType} allowDownload={allowDownload} onDownload={download} downloadOnly={purpose === "download"} />;
  const loading = mode.view.state === "loading" || exact.view.state === "loading";
  const canDownload = allowDownload && !!fileLease?.binding.allow_download;
  return <Dialog open={open} onOpenChange={props.onOpenChange}>
    <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
      <DialogHeader className="px-6 py-4 border-b border-border flex-row items-center justify-between space-y-0">
        <DialogTitle className="text-base font-medium truncate pr-4">{r.name}</DialogTitle>
        {canDownload && <div className="flex items-center gap-2 shrink-0"><Button variant="outline" size="sm" className="gap-2" onClick={download}><Download className="w-4 h-4" />Скачать</Button></div>}
      </DialogHeader>
      <div className="flex-1 relative overflow-hidden bg-muted/30">
        {loading ? <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/80"><div className="flex flex-col items-center gap-3"><SigmaSpinner size="lg" /><p className="text-sm text-muted-foreground">Загрузка предпросмотра…</p></div></div>
          : fileLease?.previewKind === "pdf" ? <VerifiedPdfCanvas lease={fileLease} title={r.name} />
          : fileLease?.previewKind === "image" ? <img src={fileLease.url} alt={r.name} className="w-full h-full object-contain" />
          : <div className="flex flex-col items-center justify-center h-full gap-4 p-8"><FileText className="w-16 h-16 text-muted-foreground/40" /><p role="status" className="text-muted-foreground text-center">{fileLease ? "Для этого формата нет безопасного предпросмотра. Файл можно скачать, если это разрешено учебным центром." : "Точная редакция файла недоступна. Обновите страницу или обратитесь в учебный центр."}</p>{props.sourceReviewAvailable && mode.view.state === "frozen_required" && cohort === null && <div className="space-y-2 text-center"><p className="text-sm text-muted-foreground">Для исходного курса выберите сохранённое досье и нужный файл в проверке каталога.</p><a className="text-sm text-primary underline underline-offset-4" href="/admin?tab=marketplace">Открыть проверку каталога</a></div>}</div>}
      </div>
    </DialogContent>
  </Dialog>;
}

function LegacyFilePreviewContent({ open, onOpenChange, fileUrl, fileName, fileType, allowDownload, onDownload, downloadOnly }: LegacyPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => { setIsLoading(true); setPreviewFailed(false); }, [open, fileUrl]);

  const preview = courseDocumentPreview(fileUrl, fileType, [import.meta.env.VITE_SUPABASE_URL, window.location.origin], window.location.origin);
  const canPreview = !downloadOnly && preview.previewUrl !== null && !previewFailed;

  useEffect(() => {
    if (!open || !canPreview || !isLoading) return;
    let current = true;
    const timer = setTimeout(() => {
      if (!current) return;
      setIsLoading(false);
      setPreviewFailed(true);
    }, 15_000);
    return () => { current = false; clearTimeout(timer); };
  }, [open, canPreview, isLoading]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base font-medium truncate pr-4">{fileName}</DialogTitle>
          {allowDownload && preview.sourceUrl && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-2" onClick={onDownload}>
                  <Download className="w-4 h-4" />
                  Скачать
                </Button>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 relative overflow-hidden bg-muted/30">
          {canPreview ? (
            <>
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/80">
                  <div className="flex flex-col items-center gap-3">
                    <SigmaSpinner size="lg" />
                    <p className="text-sm text-muted-foreground">Загрузка предпросмотра…</p>
                  </div>
                </div>
              )}
              <iframe
                src={preview.previewUrl ?? undefined}
                referrerPolicy="no-referrer"
                sandbox={preview.mode === "native_pdf" ? "" : undefined}
                className="w-full h-full border-0"
                onLoad={() => setIsLoading(false)}
                onErrorCapture={() => { setIsLoading(false); setPreviewFailed(true); }}
                title={fileName}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <FileText className="w-16 h-16 text-muted-foreground/40" />
              <p className="text-muted-foreground text-center">
                {preview.mode === "direct_only" ? "Откройте документ в новой вкладке или скачайте его." : <>Предпросмотр недоступен для файлов типа <strong>{fileType?.toUpperCase() || "—"}</strong></>}
              </p>
              {allowDownload && preview.sourceUrl && <Button className="gap-2" onClick={onDownload}>
                  <ExternalLink className="w-4 h-4" />
                  Открыть файл
                </Button>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
