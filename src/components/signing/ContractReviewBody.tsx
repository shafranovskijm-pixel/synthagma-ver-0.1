import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, FileText, Download, Send, MessageSquareText, ShieldCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReviewableDocument, type ReviewComment } from "@/components/signing/ReviewableDocument";
import { DocxRenderer } from "@/components/signing/DocxRenderer";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  signatureToken: string | null;
  readOnly?: boolean;
  /** Если true — карточка занимает всю ширину контейнера (для встраивания) */
  embedded?: boolean;
}

interface SigData {
  id: string;
  document_type: string;
  document_title: string;
  document_html: string | null;
  organization_id: string;
  organization_name: string;
  recipient_email: string;
  recipient_name: string;
  status: string;
  mode?: string;
  current_revision_id?: string | null;
  expires_at: string;
}

interface Revision {
  id: string;
  version: number;
  document_html: string | null;
  file_url: string | null;
  file_name: string | null;
  file_mime: string | null;
  created_by_name: string;
  change_summary: string | null;
  created_at: string;
}

const EXTERNAL_BUCKET = "external-contracts";

/** Если значение похоже на storage path (без http) — генерим signed URL из бакета. */
async function resolveFileUrl(raw: string | null): Promise<string | null> {
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  // Storage path → signed URL (бакет приватный)
  const { data, error } = await supabase.storage
    .from(EXTERNAL_BUCKET)
    .createSignedUrl(raw, 60 * 60);
  if (error) {
    console.error("[ContractReviewBody] signed URL error", error);
    return null;
  }
  return data?.signedUrl || null;
}

export function ContractReviewBody({ signatureToken, readOnly = false, embedded = true }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sig, setSig] = useState<SigData | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [convertedHtml, setConvertedHtml] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [requestText, setRequestText] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [pdfComment, setPdfComment] = useState("");
  const [authorName, setAuthorName] = useState("");

  const currentRevision = revisions.find(r => r.id === sig?.current_revision_id) || revisions[revisions.length - 1] || null;
  const rawFileUrl = currentRevision?.file_url || null;
  const fileMime = currentRevision?.file_mime || "";
  const isPdf = fileMime.includes("pdf") || rawFileUrl?.toLowerCase().endsWith(".pdf");
  const isDocx = fileMime.includes("wordprocessingml") || rawFileUrl?.toLowerCase().endsWith(".docx");
  const documentHtml = sig?.document_html || currentRevision?.document_html || convertedHtml || null;

  const loadAll = async (token: string) => {
    setLoading(true);
    try {
      const [sigRes, revRes, comRes] = await Promise.all([
        supabase.rpc("get_signature_by_token", { p_token: token }),
        (supabase as any).rpc("get_signature_revisions_by_token", { p_token: token }),
        (supabase as any).rpc("get_signature_comments_by_token", { p_token: token }),
      ]);
      if (sigRes.error || !sigRes.data?.length) throw new Error("Не удалось загрузить договор");
      const row = sigRes.data[0] as SigData;
      setSig(row);
      setRevisions((revRes.data as Revision[]) || []);
      setComments((comRes.data as ReviewComment[]) || []);
      setAuthorName(user?.email || row.recipient_name || "Получатель");
    } catch (e: any) {
      toast.error(e.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (signatureToken) {
      setSig(null); setRevisions([]); setComments([]); setConvertedHtml(null); setResolvedUrl(null);
      loadAll(signatureToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureToken]);

  // Резолв signed URL для приватного бакета
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await resolveFileUrl(rawFileUrl);
      if (!cancelled) setResolvedUrl(url);
    })();
    return () => { cancelled = true; };
  }, [rawFileUrl]);

  const reloadComments = async () => {
    if (!signatureToken) return;
    const { data } = await (supabase as any).rpc("get_signature_comments_by_token", { p_token: signatureToken });
    setComments((data as ReviewComment[]) || []);
  };

  const handleAddComment = async ({ quotedText, commentText, positionAnchor }: { quotedText: string; commentText: string; positionAnchor: any }) => {
    if (!signatureToken) return;
    const { error } = await (supabase as any).rpc("add_signature_comment_by_token", {
      p_token: signatureToken,
      p_author_name: authorName,
      p_quoted_text: quotedText,
      p_comment_text: commentText,
      p_position_anchor: positionAnchor,
    });
    if (error) throw error;
    await reloadComments();
  };

  const handleAddPdfComment = async () => {
    if (!signatureToken || !pdfComment.trim()) return;
    try {
      const { error } = await (supabase as any).rpc("add_signature_comment_by_token", {
        p_token: signatureToken,
        p_author_name: authorName,
        p_quoted_text: null,
        p_comment_text: pdfComment.trim(),
        p_position_anchor: null,
      });
      if (error) throw error;
      setPdfComment("");
      await reloadComments();
      toast.success("Комментарий добавлен");
    } catch (e: any) {
      toast.error(e.message || "Не удалось добавить комментарий");
    }
  };

  const handleRequestChanges = async () => {
    if (!signatureToken) return;
    setRequesting(true);
    try {
      const { error } = await (supabase as any).rpc("request_signature_changes", {
        p_token: signatureToken,
        p_summary: requestText.trim() || null,
      });
      if (error) throw error;
      toast.success("Запрос на правки отправлен");
      setRequestText("");
      await loadAll(signatureToken);
    } catch (e: any) {
      toast.error(e.message || "Не удалось отправить запрос");
    } finally {
      setRequesting(false);
    }
  };

  const handleOpenSignPage = () => {
    if (signatureToken) window.open(`/sign/${signatureToken}`, "_blank");
  };

  const canTakeAction = !readOnly && sig && (sig.status === "in_review" || sig.status === "sent" || sig.status === "changes_requested");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sig) return null;

  return (
    <div className="space-y-4">
      {/* Шапка — компактная */}
      <div className="flex items-start justify-between gap-3 flex-wrap pb-3 border-b">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">{sig.document_title}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>От: <strong>{sig.organization_name}</strong></span>
            <span>·</span>
            <span>Получатель: {sig.recipient_name}</span>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 shrink-0">
          {sig.status === "changes_requested" ? "Запрошены правки" :
            sig.status === "signed" ? "Подписан" :
            sig.status === "rejected" ? "Отклонён" : "На согласовании"}
        </Badge>
      </div>

      {/* PDF */}
      {isPdf && resolvedUrl && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">PDF-документ. Выделение текста для пофрагментных комментариев недоступно — используйте поле ниже.</p>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={resolvedUrl} target="_blank" rel="noreferrer"><Download className="w-3.5 h-3.5" />Скачать</a>
            </Button>
          </div>
          <iframe src={resolvedUrl} className="w-full h-[70vh] rounded-lg border bg-white" title={sig.document_title} />
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="border rounded-lg p-3 bg-muted/20 max-h-[300px] overflow-auto">
              <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <MessageSquareText className="w-4 h-4" />Комментарии {comments.length > 0 && <Badge variant="secondary">{comments.length}</Badge>}
              </div>
              {comments.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">Пока нет комментариев.</div>
              ) : (
                <div className="space-y-2">
                  {comments.map(c => (
                    <div key={c.id} className="rounded-md border bg-background p-2.5 text-sm">
                      <div className="text-xs font-medium mb-0.5">{c.author_name}</div>
                      {c.quoted_text && (
                        <blockquote className="text-[11px] italic border-l-2 border-amber-400 pl-1.5 mb-1 text-muted-foreground line-clamp-2">«{c.quoted_text}»</blockquote>
                      )}
                      <div className="text-xs whitespace-pre-wrap">{c.comment_text}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString("ru-RU")}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {!readOnly && (
              <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                <Label className="text-xs">Добавить комментарий</Label>
                <Textarea value={pdfComment} onChange={(e) => setPdfComment(e.target.value)} rows={4} placeholder="Опишите замечание или предложение по договору…" />
                <Button size="sm" className="w-full gap-1.5" onClick={handleAddPdfComment} disabled={!pdfComment.trim()}>
                  <Send className="w-3.5 h-3.5" />Отправить
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DOCX → HTML */}
      {isDocx && resolvedUrl && !documentHtml && (
        <DocxRenderer
          fileUrl={resolvedUrl}
          storagePath={rawFileUrl && !rawFileUrl.startsWith("http") ? rawFileUrl : null}
          cachedHtml={currentRevision?.document_html}
          revisionId={currentRevision?.id}
          onHtmlReady={setConvertedHtml}
        />
      )}

      {/* HTML / converted DOCX with reviewable comments */}
      {!isPdf && documentHtml && (
        <ReviewableDocument
          documentHtml={documentHtml}
          comments={comments}
          authorName={authorName}
          canComment={!readOnly}
          onAddComment={handleAddComment}
        />
      )}

      {/* Loader для signed URL */}
      {!resolvedUrl && rawFileUrl && (
        <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Загрузка документа…</span>
        </div>
      )}

      {/* Fallback */}
      {!isPdf && !isDocx && !documentHtml && resolvedUrl && (
        <div className="text-center text-muted-foreground p-12">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm mb-3">Этот формат не поддерживается для встроенного просмотра.</p>
          <Button variant="outline" size="sm" asChild><a href={resolvedUrl} target="_blank" rel="noreferrer"><Download className="w-3.5 h-3.5 mr-1.5" />Скачать файл</a></Button>
        </div>
      )}
      {!rawFileUrl && !documentHtml && (
        <div className="text-center text-muted-foreground p-12">
          <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
          Документ пуст.
        </div>
      )}

      {/* Action footer */}
      {canTakeAction && (
        <div className="border-t bg-muted/30 -mx-4 px-4 py-4 mt-4 space-y-3 rounded-b-xl">
          <div className="grid lg:grid-cols-[1fr_auto] gap-3 items-start">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5"><MessageSquareText className="w-3 h-3" />Запросить правки (опционально)</Label>
              <Textarea
                rows={2}
                value={requestText}
                onChange={(e) => setRequestText(e.target.value)}
                placeholder="Краткое описание необходимых изменений…"
                className="text-xs"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRequestChanges} disabled={requesting}>
                <Send className="w-3.5 h-3.5" />
                {requesting ? "Отправка…" : "Запросить правки"}
              </Button>
              <Button size="sm" className="gap-1.5" onClick={handleOpenSignPage}>
                <ShieldCheck className="w-3.5 h-3.5" />Согласовать и подписать
                <ExternalLink className="w-3 h-3 opacity-70" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">Подписание ПЭП открывается в отдельной вкладке для соблюдения требований 63-ФЗ.</p>
        </div>
      )}
    </div>
  );
}
