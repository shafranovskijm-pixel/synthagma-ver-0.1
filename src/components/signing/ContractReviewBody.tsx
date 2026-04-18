import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, FileText, Download, Send, MessageSquareText, ShieldCheck,
  Check, X, Reply, Upload, AlertTriangle, Trash2, PenLine, CheckCircle2, Eye, FileSignature,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ReviewableDocument, type ReviewComment } from "@/components/signing/ReviewableDocument";
import { DocxRenderer } from "@/components/signing/DocxRenderer";
import { SignatureRevisionUploader } from "@/components/signing/SignatureRevisionUploader";
import { PepSignatureStamp } from "@/components/signing/PepSignatureStamp";
import { PepAgreementDialog } from "@/components/signing/PepAgreementDialog";
import { HandwrittenSignUploader } from "@/components/signing/HandwrittenSignUploader";
import { SignedDocumentPreview } from "@/components/signing/SignedDocumentPreview";
import { getPepAgreementText, PEP_AGREEMENT_VERSION } from "@/constants/pepAgreementTemplate";
import { OPERATOR } from "@/constants/operatorDetails";
import { sha256Hex } from "@/utils/documentHash";
import { applyAcceptedEdits } from "@/lib/applyAcceptedEdits";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface Props {
  signatureToken: string | null;
  /** Полностью read-only режим (наблюдатель). */
  readOnly?: boolean;
  /** Роль смотрящего: "recipient" — клиент, "organization" — отправитель. */
  viewerRole?: "recipient" | "organization";
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
  signed_at?: string | null;
  signed_ip?: string | null;
  sender_signed_at?: string | null;
  sender_signed_ip?: string | null;
  sender_name?: string | null;
  signature_method?: "pep" | "handwritten_scan" | null;
  handwritten_scan_path?: string | null;
  signed_document_path?: string | null;
  document_hash?: string | null;
  pep_agreement_id?: string | null;
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

interface OrgComment extends ReviewComment {
  resolution_status?: "pending" | "accepted" | "rejected";
  org_reply?: string | null;
}

const EXTERNAL_BUCKET = "external-contracts";

async function resolveFileUrl(raw: string | null): Promise<string | null> {
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const { data, error } = await supabase.storage
    .from(EXTERNAL_BUCKET)
    .createSignedUrl(raw, 60 * 60);
  if (error) {
    console.error("[ContractReviewBody] signed URL error", error);
    return null;
  }
  return data?.signedUrl || null;
}

export function ContractReviewBody({
  signatureToken,
  readOnly = false,
  viewerRole = "recipient",
  embedded = true,
}: Props) {
  const { user } = useAuth();
  const isOrg = viewerRole === "organization" && !readOnly;

  const [loading, setLoading] = useState(false);
  const [sig, setSig] = useState<SigData | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [comments, setComments] = useState<OrgComment[]>([]);
  const [convertedHtml, setConvertedHtml] = useState<string | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [requestText, setRequestText] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [pdfComment, setPdfComment] = useState("");
  const [authorName, setAuthorName] = useState("");

  // Org-mode state
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showRevisionUploader, setShowRevisionUploader] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [orgMessage, setOrgMessage] = useState("");

  // Inline signing state (recipient AND organization)
  const [signPanelOpen, setSignPanelOpen] = useState(false);
  const [signFullName, setSignFullName] = useState("");
  const [signEmail, setSignEmail] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [signAccepted, setSignAccepted] = useState(false);
  const [submittingSign, setSubmittingSign] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ ip: string; signedAt: string; pepAgreementId: string } | null>(null);
  const [signMethod, setSignMethod] = useState<"pep" | "handwritten_scan">("pep");
  const [agreementDialogOpen, setAgreementDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const currentRevision =
    revisions.find(r => r.id === sig?.current_revision_id) ||
    revisions[revisions.length - 1] ||
    null;
  const rawFileUrl = currentRevision?.file_url || null;
  const fileMime = currentRevision?.file_mime || "";
  const isPdf = fileMime.includes("pdf") || rawFileUrl?.toLowerCase().endsWith(".pdf");
  const isDocx = fileMime.includes("wordprocessingml") || rawFileUrl?.toLowerCase().endsWith(".docx");
  const documentHtml = sig?.document_html || currentRevision?.document_html || convertedHtml || null;

  // Merge accepted client edits into the HTML — used in the signed preview popup AND in the final PDF.
  const { html: mergedHtml, applied: appliedEdits } = useMemo(() => {
    if (!documentHtml) return { html: null as string | null, applied: [] as ReturnType<typeof applyAcceptedEdits>["applied"] };
    const result = applyAcceptedEdits(documentHtml, comments as any);
    return { html: result.html, applied: result.applied };
  }, [documentHtml, comments]);

  const pendingCount = comments.filter(c => (c.resolution_status ?? "pending") === "pending").length;
  const acceptedCount = comments.filter(c => c.resolution_status === "accepted").length;
  const rejectedCount = comments.filter(c => c.resolution_status === "rejected").length;

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
      setComments((comRes.data as OrgComment[]) || []);
      setAuthorName(user?.email || row.recipient_name || "Получатель");
      // ФИО / email подписанта: для организации — реквизиты Оператора (ИП Шафрановский),
      // для получателя — его собственные данные.
      if (viewerRole === "organization") {
        setSignFullName(OPERATOR.fullName);
        setSignEmail(OPERATOR.email);
      } else {
        setSignFullName(row.recipient_name || "");
        setSignEmail(row.recipient_email || user?.email || "");
      }
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
    setComments((data as OrgComment[]) || []);
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

  // Inline-sign helpers (recipient AND organization)
  const today = new Date().toLocaleDateString("ru-RU");
  const agreementText = sig ? getPepAgreementText({
    org_name: sig.organization_name,
    org_inn: (sig as any).organization_inn || undefined,
    user_name: signFullName || sig.recipient_name,
    user_email: signEmail || sig.recipient_email,
    current_date: today,
  }) : "";

  const handleWithdrawComment = async (commentId: string) => {
    if (!signatureToken) return;
    if (!confirm("Удалить эту правку? Действие необратимо.")) return;
    try {
      const { error } = await (supabase as any).rpc("delete_signature_comment_by_token", {
        p_token: signatureToken,
        p_comment_id: commentId,
      });
      if (error) throw error;
      await reloadComments();
      toast.success("Правка удалена");
    } catch (e: any) {
      toast.error(e.message || "Не удалось удалить");
    }
  };

  const handleInlineSign = async () => {
    if (!sig || !signatureToken || !signAccepted || !agreementAccepted) return;
    setSubmittingSign(true);
    try {
      const docHash = documentHtml
        ? await sha256Hex(documentHtml)
        : await sha256Hex(sig.document_title);
      const { data, error } = await supabase.functions.invoke("finalize-signature", {
        body: {
          token: signatureToken,
          documentHash: docHash,
          pepAgreement: {
            agreement_text: agreementText,
            agreement_version: PEP_AGREEMENT_VERSION,
            full_name: signFullName,
            email: signEmail,
          },
        },
      });
      if (error || (data as any)?.error) {
        throw new Error((data as any)?.error || error?.message || "Ошибка подписания");
      }
      setSignedInfo({
        ip: (data as any).ip,
        signedAt: (data as any).signedAt,
        pepAgreementId: (data as any).pepAgreementId,
      });
      toast.success("Документ подписан");
      await loadAll(signatureToken);
    } catch (e: any) {
      toast.error(e.message || "Не удалось подписать документ");
    } finally {
      setSubmittingSign(false);
    }
  };

  // ==== ORG ACTIONS ====
  const setResolution = async (commentId: string, status: "accepted" | "rejected" | "pending", reply?: string) => {
    try {
      const { error } = await (supabase as any).rpc("set_signature_comment_resolution", {
        p_comment_id: commentId,
        p_resolution_status: status,
        p_org_reply: reply ?? null,
      });
      if (error) throw error;
      await reloadComments();
      if (status === "accepted") toast.success("Правка принята");
      else if (status === "rejected") toast.success("Правка отклонена");
      else toast.success("Решение сброшено");
    } catch (e: any) {
      toast.error(e.message || "Не удалось обновить решение");
    }
  };

  const handleSubmitReply = async (commentId: string) => {
    if (!replyText.trim()) return;
    try {
      const { error } = await (supabase as any).rpc("set_signature_comment_resolution", {
        p_comment_id: commentId,
        p_resolution_status: comments.find(c => c.id === commentId)?.resolution_status || "pending",
        p_org_reply: replyText.trim(),
      });
      if (error) throw error;
      setReplyOpenId(null);
      setReplyText("");
      await reloadComments();
      toast.success("Ответ отправлен");
    } catch (e: any) {
      toast.error(e.message || "Не удалось отправить ответ");
    }
  };

  const handleOrgFinalize = async (action: "reject_all" | "send_new_version" | "sign_as_is" | "send_decisions") => {
    if (!sig) return;
    const confirmText = action === "reject_all"
      ? "Отклонить все правки клиента и вернуть документ?"
      : action === "sign_as_is"
        ? "Подписать документ в текущем виде?"
        : action === "send_decisions"
          ? `Отправить клиенту ваши решения по правкам?${pendingCount > 0 ? `\n\nВнимание: ${pendingCount} правок ещё не рассмотрены — клиент увидит их как «в ожидании».` : ""}`
          : null;
    if (confirmText && !confirm(confirmText)) return;

    setFinalizing(true);
    try {
      if (action === "sign_as_is") {
        // Открываем инлайн-панель ПЭП без вызова RPC — RPC вызовется уже из самой подписи (finalize-signature)
        // через handleInlineSign. Так избегаем двойного финализирования и подписи остаётся валидной.
        setSignFullName(prev => prev || OPERATOR.fullName);
        setSignEmail(prev => prev || OPERATOR.email);
        setSignPanelOpen(true);
        setTimeout(() => {
          document.getElementById("inline-sign-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
        toast.success("Заполните данные ниже и подпишите документ");
      } else {
        const { error } = await (supabase as any).rpc("org_finalize_signature_review", {
          p_signature_id: sig.id,
          p_action: action,
          p_message: orgMessage.trim() || null,
        });
        if (error) throw error;
        setOrgMessage("");
        await loadAll(signatureToken!);
        toast.success(
          action === "reject_all" ? "Правки отклонены"
          : action === "send_decisions" ? "Решения отправлены клиенту"
          : "Уведомление отправлено клиенту"
        );
      }
    } catch (e: any) {
      toast.error(e.message || "Не удалось выполнить действие");
    } finally {
      setFinalizing(false);
    }
  };

  const canTakeRecipientAction = !isOrg && !readOnly && sig &&
    (sig.status === "in_review" || sig.status === "sent" || sig.status === "changes_requested");
  const canTakeOrgAction = isOrg && sig &&
    (sig.status === "changes_requested" || sig.status === "in_review" || sig.status === "sent");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sig) return null;

  const renderCommentCard = (c: OrgComment) => {
    const status = c.resolution_status ?? "pending";
    const statusBadge =
      status === "accepted" ? <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300 text-[10px]">Принята</Badge>
      : status === "rejected" ? <Badge className="bg-red-500/15 text-red-700 border-red-300 text-[10px]">Отклонена</Badge>
      : <Badge variant="outline" className="text-[10px]">В ожидании</Badge>;
    return (
      <div key={c.id} className={cn(
        "rounded-md border bg-background p-2.5 text-sm",
        status === "accepted" && "border-emerald-300/60",
        status === "rejected" && "border-red-300/60 opacity-80",
      )}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-xs font-medium">{c.author_name}</div>
          {statusBadge}
        </div>
        {c.quoted_text && (
          <blockquote className="text-[11px] italic border-l-2 border-amber-400 pl-1.5 mb-1 text-muted-foreground line-clamp-3">«{c.quoted_text}»</blockquote>
        )}
        <div className="text-xs whitespace-pre-wrap">{c.comment_text}</div>
        <div className="text-[10px] text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString("ru-RU")}</div>

        {c.org_reply && (
          <div className="mt-2 rounded border border-primary/20 bg-primary/5 p-2 text-xs">
            <div className="text-[10px] font-semibold text-primary mb-0.5">Ответ организации:</div>
            <div className="whitespace-pre-wrap">{c.org_reply}</div>
          </div>
        )}

        {isOrg && (
          <div className="mt-2 pt-2 border-t flex items-center gap-1.5 flex-wrap">
            <Button
              size="sm" variant={status === "accepted" ? "default" : "outline"}
              className={cn("h-7 text-[11px] gap-1", status === "accepted" && "bg-emerald-600 hover:bg-emerald-700")}
              onClick={() => setResolution(c.id, status === "accepted" ? "pending" : "accepted")}
            >
              <Check className="w-3 h-3" />Принять
            </Button>
            <Button
              size="sm" variant={status === "rejected" ? "destructive" : "outline"}
              className="h-7 text-[11px] gap-1"
              onClick={() => setResolution(c.id, status === "rejected" ? "pending" : "rejected")}
            >
              <X className="w-3 h-3" />Отклонить
            </Button>
            <Button
              size="sm" variant="ghost" className="h-7 text-[11px] gap-1"
              onClick={() => { setReplyOpenId(replyOpenId === c.id ? null : c.id); setReplyText(c.org_reply || ""); }}
            >
              <Reply className="w-3 h-3" />{c.org_reply ? "Изменить ответ" : "Ответить"}
            </Button>
          </div>
        )}

        {/* Recipient: позволить отозвать собственную правку, пока орг ещё не отреагировал */}
        {!isOrg && !readOnly && status === "pending" && (
          <div className="mt-2 pt-2 border-t flex items-center justify-end">
            <Button
              size="sm" variant="ghost" className="h-7 text-[11px] gap-1 text-destructive hover:text-destructive"
              onClick={() => handleWithdrawComment(c.id)}
            >
              <Trash2 className="w-3 h-3" />Отозвать правку
            </Button>
          </div>
        )}

        {isOrg && replyOpenId === c.id && (
          <div className="mt-2 space-y-1.5">
            <Textarea
              value={replyText} onChange={e => setReplyText(e.target.value)}
              rows={2} placeholder="Ваш ответ на правку клиента…"
              className="text-xs"
            />
            <div className="flex gap-1.5 justify-end">
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { setReplyOpenId(null); setReplyText(""); }}>Отмена</Button>
              <Button size="sm" className="h-7 text-[11px] gap-1" onClick={() => handleSubmitReply(c.id)} disabled={!replyText.trim()}>
                <Send className="w-3 h-3" />Отправить
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Шапка */}
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
            {currentRevision && <><span>·</span><span>Версия {currentRevision.version}</span></>}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 shrink-0">
          {sig.status === "changes_requested" ? "Запрошены правки" :
            sig.status === "signed" ? "Подписан" :
            sig.status === "rejected" ? "Отклонён" : "На согласовании"}
        </Badge>
      </div>

      {/* Org summary bar — для организации показываем счётчики */}
      {isOrg && comments.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs bg-muted/40 rounded-lg px-3 py-2">
          <span className="font-medium">Правки клиента:</span>
          <Badge variant="outline">Всего {comments.length}</Badge>
          {pendingCount > 0 && <Badge variant="outline" className="text-amber-700 border-amber-300">В ожидании {pendingCount}</Badge>}
          {acceptedCount > 0 && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300">Принято {acceptedCount}</Badge>}
          {rejectedCount > 0 && <Badge className="bg-red-500/15 text-red-700 border-red-300">Отклонено {rejectedCount}</Badge>}
        </div>
      )}

      {/* PDF */}
      {isPdf && resolvedUrl && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">PDF-документ. Используйте поле ниже для общих комментариев.</p>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={resolvedUrl} target="_blank" rel="noreferrer"><Download className="w-3.5 h-3.5" />Скачать</a>
            </Button>
          </div>
          <iframe src={resolvedUrl} className="w-full h-[70vh] rounded-lg border bg-white" title={sig.document_title} />
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="border rounded-lg p-3 bg-muted/20 max-h-[400px] overflow-auto">
              <div className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <MessageSquareText className="w-4 h-4" />Комментарии {comments.length > 0 && <Badge variant="secondary">{comments.length}</Badge>}
              </div>
              {comments.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">Пока нет комментариев.</div>
              ) : (
                <div className="space-y-2">{comments.map(renderCommentCard)}</div>
              )}
            </div>
            {!readOnly && !isOrg && (
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
        <div className={cn(isOrg && "grid lg:grid-cols-[1fr_320px] gap-4")}>
          <ReviewableDocument
            documentHtml={documentHtml}
            comments={comments}
            authorName={authorName}
            canComment={!readOnly && !isOrg}
            onAddComment={handleAddComment}
          />
          {isOrg && (
            <div className="border rounded-lg p-3 bg-muted/20 max-h-[70vh] overflow-auto space-y-2">
              <div className="text-sm font-semibold flex items-center gap-1.5 sticky top-0 bg-muted/60 -m-3 mb-1 px-3 py-2 backdrop-blur">
                <MessageSquareText className="w-4 h-4" />Правки клиента
              </div>
              {comments.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">Клиент пока не оставил правок.</div>
              ) : (
                comments.map(renderCommentCard)
              )}
            </div>
          )}
        </div>
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

      {/* === ORG ACTION FOOTER === */}
      {canTakeOrgAction && (
        <div className="border-t bg-gradient-to-br from-primary/5 to-transparent -mx-4 px-4 py-4 mt-4 space-y-3 rounded-b-xl">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Действия организации
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1.5">
              <MessageSquareText className="w-3 h-3" />
              Сообщение клиенту (необязательно)
            </Label>
            <Textarea
              rows={2} value={orgMessage} onChange={e => setOrgMessage(e.target.value)}
              placeholder="Например: учли все правки кроме п. 5.1 — оставили в исходной редакции."
              className="text-xs"
            />
          </div>
          {pendingCount > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Остались нерассмотренные правки ({pendingCount}). Рекомендуется обработать каждую перед финализацией.</span>
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Button
              size="sm" className="gap-1.5"
              onClick={() => handleOrgFinalize("send_decisions")}
              disabled={finalizing}
            >
              <Send className="w-3.5 h-3.5" />Отправить решения клиенту
            </Button>
            <Button
              size="sm" variant="outline" className="gap-1.5 border-primary/40"
              onClick={() => setShowRevisionUploader(true)}
              disabled={finalizing}
            >
              <Upload className="w-3.5 h-3.5" />Отправить новую версию
            </Button>
            <Button
              size="sm" className="gap-1.5"
              onClick={() => handleOrgFinalize("sign_as_is")}
              disabled={finalizing}
            >
              <ShieldCheck className="w-3.5 h-3.5" />Подписать как есть
            </Button>
            <Button
              size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => handleOrgFinalize("reject_all")}
              disabled={finalizing}
            >
              <X className="w-3.5 h-3.5" />Отклонить все правки
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            «Отправить решения» вернёт документ клиенту со сводкой принятых/отклонённых правок. «Подписать как есть» откроет панель ПЭП прямо здесь.
          </p>
        </div>
      )}

      {/* === INLINE SIGN PANEL (для recipient И organization) === */}
      {signPanelOpen && !signedInfo && sig.status !== "signed" && (
        <div id="inline-sign-panel" className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-3 mt-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Подписать прямо здесь {isOrg && <Badge variant="outline" className="text-[10px]">подпись организации</Badge>}
          </div>

          <Tabs value={signMethod} onValueChange={(v) => setSignMethod(v as "pep" | "handwritten_scan")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-9">
              <TabsTrigger value="pep" className="text-xs gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />Электронно (ПЭП)
              </TabsTrigger>
              <TabsTrigger value="handwritten_scan" className="text-xs gap-1.5">
                <FileSignature className="w-3.5 h-3.5" />Скан с подписью и печатью
              </TabsTrigger>
            </TabsList>

            <div className="grid sm:grid-cols-2 gap-2 mt-3">
              <div className="space-y-1">
                <Label className="text-[11px]">ФИО подписанта</Label>
                <Input value={signFullName} onChange={(e) => setSignFullName(e.target.value)} placeholder="Иванов Иван Иванович" className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Email</Label>
                <Input type="email" value={signEmail} onChange={(e) => setSignEmail(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>

            <TabsContent value="pep" className="space-y-3 mt-3">
              <div className="flex items-start gap-2">
                <Checkbox id="agree-shared" checked={agreementAccepted} onCheckedChange={(v) => setAgreementAccepted(!!v)} />
                <Label htmlFor="agree-shared" className="text-[11px] leading-relaxed cursor-pointer">
                  Я ознакомился(ась) и принимаю условия{" "}
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); setAgreementDialogOpen(true); }}
                    className="text-primary underline underline-offset-2 hover:text-primary/80 font-medium"
                  >
                    Соглашения об использовании ПЭП
                  </button>
                  {" "}(63-ФЗ).
                </Label>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5 h-8 text-[11px]"
                onClick={() => setAgreementDialogOpen(true)}
              >
                <Eye className="w-3.5 h-3.5" />Открыть полный текст соглашения
              </Button>
              <div className="flex items-start gap-2">
                <Checkbox id="sign-shared" checked={signAccepted} onCheckedChange={(v) => setSignAccepted(!!v)} />
                <Label htmlFor="sign-shared" className="text-[11px] leading-relaxed cursor-pointer">
                  Я, <strong>{signFullName || "—"}</strong>, подписываю «{sig.document_title}» простой электронной подписью. Подпись имеет юридическую силу, равную собственноручной.
                </Label>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSignPanelOpen(false)} disabled={submittingSign}>
                  Отмена
                </Button>
                <Button
                  className="flex-1 gap-1.5"
                  size="sm"
                  onClick={handleInlineSign}
                  disabled={submittingSign || !signAccepted || !agreementAccepted || !signFullName.trim() || !signEmail.trim()}
                >
                  {submittingSign ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  {submittingSign ? "Подписание…" : "Подписать"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="handwritten_scan" className="mt-3">
              <HandwrittenSignUploader
                signatureId={sig.id}
                organizationId={sig.organization_id}
                signatureToken={signatureToken!}
                signerName={signFullName}
                signerEmail={signEmail}
                onSigned={async (info) => {
                  setSignedInfo({ ip: info.ip, signedAt: info.signedAt, pepAgreementId: info.pepAgreementId });
                  await loadAll(signatureToken!);
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* === RECIPIENT ACTION FOOTER === */}
      {canTakeRecipientAction && !signedInfo && sig.status !== "signed" && (
        <div className="border-t bg-gradient-to-br from-primary/5 to-transparent -mx-4 px-4 py-4 mt-4 space-y-4 rounded-b-xl">
          {/* Сводка */}
          {comments.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-xs bg-muted/40 rounded-lg px-3 py-2">
              <span className="font-medium">Ваши правки:</span>
              <Badge variant="outline">Всего {comments.length}</Badge>
              {pendingCount > 0 && <Badge variant="outline" className="text-amber-700 border-amber-300">Не отправлено отправителю: {pendingCount}</Badge>}
              {acceptedCount > 0 && <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300">Принято: {acceptedCount}</Badge>}
              {rejectedCount > 0 && <Badge className="bg-red-500/15 text-red-700 border-red-300">Отклонено: {rejectedCount}</Badge>}
            </div>
          )}

          {/* Блок 1: отправить все правки разом */}
          <div className="rounded-lg border bg-background/60 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Send className="w-4 h-4 text-primary" />
              Отправить правки отправителю одной кнопкой
            </div>
            <p className="text-[11px] text-muted-foreground">
              Все добавленные вами правки уйдут отправителю одним пакетом. Вы можете оставить общий комментарий ниже.
            </p>
            <Textarea
              rows={2}
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              placeholder="Общий комментарий отправителю (необязательно)…"
              className="text-xs"
            />
            <Button
              className="w-full gap-1.5"
              size="sm"
              onClick={handleRequestChanges}
              disabled={requesting || (comments.length === 0 && !requestText.trim())}
            >
              <Send className="w-3.5 h-3.5" />
              {requesting ? "Отправка…" : `Отправить все правки${comments.length > 0 ? ` (${comments.length})` : ""}`}
            </Button>
          </div>

          {/* Блок 2: подписать здесь — открывает общую панель ниже */}
          {!signPanelOpen && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Подписать прямо здесь
              </div>
              <p className="text-[11px] text-muted-foreground">
                Если вас всё устраивает — подпишите документ простой электронной подписью без перехода на другую страницу.
              </p>
              <Button
                className="w-full gap-1.5"
                size="sm"
                onClick={() => {
                  setSignPanelOpen(true);
                  setTimeout(() => {
                    document.getElementById("inline-sign-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 50);
                }}
              >
                <PenLine className="w-3.5 h-3.5" />Подписать здесь
              </Button>
            </div>
          )}
        </div>
      )}

      {/* === SIGNED CONFIRMATION === */}
      {(signedInfo || sig.status === "signed" || sig.sender_signed_at) && (() => {
        // Собираем данные обеих сторон.
        const senderStamp = sig.sender_signed_at
          ? {
              fullName: sig.sender_name || OPERATOR.fullName,
              email: OPERATOR.email,
              signedAt: sig.sender_signed_at,
              ip: sig.sender_signed_ip || null,
              documentHash: sig.document_hash || null,
              agreementId: sig.pep_agreement_id || null,
            }
          : (isOrg && signedInfo
            ? {
                fullName: signFullName || OPERATOR.fullName,
                email: signEmail || OPERATOR.email,
                signedAt: signedInfo.signedAt,
                ip: signedInfo.ip,
                documentHash: sig.document_hash || null,
                agreementId: signedInfo.pepAgreementId,
              }
            : null);
        const recipientStamp = sig.signed_at
          ? {
              fullName: sig.recipient_name,
              email: sig.recipient_email,
              signedAt: sig.signed_at,
              ip: sig.signed_ip || null,
              documentHash: sig.document_hash || null,
              agreementId: sig.pep_agreement_id || null,
            }
          : (!isOrg && signedInfo
            ? {
                fullName: signFullName,
                email: signEmail,
                signedAt: signedInfo.signedAt,
                ip: signedInfo.ip,
                documentHash: sig.document_hash || null,
                agreementId: signedInfo.pepAgreementId,
              }
            : null);
        const bothSigned = !!senderStamp && !!recipientStamp;
        return (
          <div className="border-t mt-4 pt-4 -mx-4 px-4 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
            <div className="text-sm font-semibold">
              {bothSigned ? "Документ подписан сторонами" : "Документ подписан"}
            </div>

            <div className="grid md:grid-cols-2 gap-3 text-left max-w-3xl mx-auto">
              {senderStamp && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-center md:text-left">
                    Отправитель (Оператор)
                  </div>
                  <PepSignatureStamp
                    fullName={senderStamp.fullName}
                    email={senderStamp.email}
                    signedAt={senderStamp.signedAt}
                    ip={senderStamp.ip}
                    documentHash={senderStamp.documentHash}
                    agreementId={senderStamp.agreementId}
                  />
                </div>
              )}
              {recipientStamp && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground text-center md:text-left">
                    Получатель
                  </div>
                  <PepSignatureStamp
                    fullName={recipientStamp.fullName}
                    email={recipientStamp.email}
                    signedAt={recipientStamp.signedAt}
                    ip={recipientStamp.ip}
                    documentHash={recipientStamp.documentHash}
                    agreementId={recipientStamp.agreementId}
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Копия подписанного документа отправлена на {signEmail || sig.recipient_email}.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPreviewOpen(true)}>
                <Eye className="w-4 h-4" />Посмотреть подписанный документ
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => setPreviewOpen(true)}>
                <Download className="w-4 h-4" />Скачать PDF
              </Button>
            </div>
          </div>
        );
      })()}

      {/* === DIALOGS === */}
      <PepAgreementDialog
        open={agreementDialogOpen}
        onOpenChange={setAgreementDialogOpen}
        agreementText={agreementText}
        onAccept={() => setAgreementAccepted(true)}
      />

      {sig && (
        <SignedDocumentPreview
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          signatureId={sig.id}
          documentTitle={sig.document_title}
          documentHtml={documentHtml}
          attachedFilePath={rawFileUrl && !rawFileUrl.startsWith("http") ? rawFileUrl : null}
          attachedFileMime={fileMime || null}
          handwrittenScanPath={sig.handwritten_scan_path || null}
          signedDocumentPath={sig.signed_document_path || null}
          signatureMethod={sig.signature_method || "pep"}
          sender={sig.sender_signed_at ? {
            fullName: sig.sender_name || OPERATOR.fullName,
            email: OPERATOR.email,
            signedAt: sig.sender_signed_at,
            ip: sig.sender_signed_ip,
            documentHash: sig.document_hash,
            agreementId: sig.pep_agreement_id,
          } : (isOrg && signedInfo ? {
            fullName: signFullName,
            email: signEmail,
            signedAt: signedInfo.signedAt,
            ip: signedInfo.ip,
            documentHash: sig.document_hash,
            agreementId: signedInfo.pepAgreementId,
          } : undefined)}
          recipient={sig.signed_at ? {
            fullName: sig.recipient_name,
            email: sig.recipient_email,
            signedAt: sig.signed_at,
            ip: sig.signed_ip,
            documentHash: sig.document_hash,
            agreementId: sig.pep_agreement_id,
          } : (!isOrg && signedInfo ? {
            fullName: signFullName,
            email: signEmail,
            signedAt: signedInfo.signedAt,
            ip: signedInfo.ip,
            documentHash: sig.document_hash,
            agreementId: signedInfo.pepAgreementId,
          } : undefined)}
        />
      )}

      {/* Revision uploader (org-only) */}
      {isOrg && sig && (
        <SignatureRevisionUploader
          open={showRevisionUploader}
          onOpenChange={setShowRevisionUploader}
          signatureId={sig.id}
          organizationId={sig.organization_id}
          title="Отправить новую версию клиенту"
          onUploaded={async () => {
            // После загрузки новой ревизии — финализируем "send_new_version" чтобы выслать уведомление клиенту
            try {
              await (supabase as any).rpc("org_finalize_signature_review", {
                p_signature_id: sig.id,
                p_action: "send_new_version",
                p_message: orgMessage.trim() || null,
              });
              setOrgMessage("");
            } catch (e) {
              console.error(e);
            }
            await loadAll(signatureToken!);
          }}
        />
      )}
    </div>
  );
}
