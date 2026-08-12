import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCopy, Download, Inbox, Loader2, MessageSquareReply, RefreshCw, UserCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { buildProgramReplyTemplate } from "@/lib/mailing/programReplyTemplate";
import { buildGroupIntakeCsv } from "@/lib/mailing/groupIntakeExport";
import { summarizeReplyContacts } from "@/lib/mailing/replyCandidates";
import { loadAllReportPages } from "@/lib/mailing/reportPagination";

interface Props {
  organizationId: string | null;
}

type ReplyClassification =
  | "interested"
  | "not_interested"
  | "unsubscribe"
  | "auto_reply"
  | "needs_review";
type ReviewStatus = "new" | "qualified" | "contacted" | "enrolled" | "closed";

interface ReplyRow {
  id: string;
  campaign_id: string;
  sender_id: string;
  remote_email: string;
  remote_name: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string;
  updated_at: string;
  classification: ReplyClassification;
  interest_hours: number | null;
  review_status: ReviewStatus;
}

const classificationLabel: Record<ReplyClassification, string> = {
  interested: "Есть интерес",
  not_interested: "Не интересно",
  unsubscribe: "Отписка",
  auto_reply: "Автоответ",
  needs_review: "Нужно проверить",
};

const statusLabel: Record<ReviewStatus, string> = {
  new: "Новый",
  qualified: "Подтверждён",
  contacted: "Связались",
  enrolled: "Отмечен для группы",
  closed: "Закрыт",
};

export function MailingRepliesTab({ organizationId }: Props) {
  const [rows, setRows] = useState<ReplyRow[]>([]);
  const [campaignNames, setCampaignNames] = useState<Record<string, string>>({});
  const [senderEmails, setSenderEmails] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState({ ready: 0, total: 0, errors: 0 });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReplyClassification | "all">("all");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [replyResult, campaignResult, senderResult] = await Promise.all([
      loadAllReportPages(async (from, to) => {
        const { data, error } = await supabase
          .from("mailing_campaign_replies")
          .select("id,campaign_id,sender_id,remote_email,remote_name,subject,body_text,received_at,updated_at,classification,interest_hours,review_status")
          .eq("organization_id", organizationId)
          .order("received_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return (data || []) as ReplyRow[];
      }).then((data) => ({ data, error: null })).catch((error: unknown) => ({ data: [] as ReplyRow[], error })),
      supabase
        .from("email_campaigns")
        .select("id,name")
        .eq("organization_id", organizationId)
        .eq("campaign_mode", "cold_outreach"),
      supabase
        .from("mailing_senders")
        .select("id,from_email")
        .eq("organization_id", organizationId),
    ]);

    if (replyResult.error || campaignResult.error || senderResult.error) {
      toast.error("Не удалось загрузить ответы кампании");
      setLoading(false);
      return;
    }

    const senders = senderResult.data || [];
    const senderIds = senders.map((sender) => sender.id);
    // Keep each PostgREST URL comfortably below proxy limits when an
    // organization has hundreds of sender UUIDs.
    const senderIdChunks = Array.from(
      { length: Math.ceil(senderIds.length / 50) },
      (_, index) => senderIds.slice(index * 50, (index + 1) * 50),
    );
    const stateResults = await Promise.all(senderIdChunks.map((ids) => supabase
      .from("mailing_reply_scan_state")
      .select("sender_id,baseline_completed,last_error_category")
      .in("sender_id", ids)));
    if (stateResults.some((result) => result.error)) {
      toast.error("Не удалось проверить готовность сбора ответов");
    }

    const states = stateResults.flatMap((result) => result.data || []);
    setRows(replyResult.data);
    setCampaignNames(Object.fromEntries((campaignResult.data || []).map((campaign) => [campaign.id, campaign.name])));
    setSenderEmails(Object.fromEntries(senders.map((sender) => [sender.id, sender.from_email])));
    setBaseline({
      ready: states.filter((state) => state.baseline_completed).length,
      total: senderIds.length,
      errors: states.filter((state) => !!state.last_error_category).length,
    });
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summarizeReplyContacts(rows), [rows]);

  const visibleRows = useMemo(
    () => filter === "all" ? rows : rows.filter((row) => row.classification === filter),
    [filter, rows],
  );

  const updateStatus = async (row: ReplyRow, reviewStatus: ReviewStatus) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from("mailing_campaign_replies")
      .update({ review_status: reviewStatus })
      .eq("id", row.id)
      .eq("organization_id", organizationId!);
    setSavingId(null);
    if (error) {
      toast.error("Не удалось изменить статус ответа");
      return;
    }
    const updatedAt = new Date().toISOString();
    setRows((current) => current.map((item) => item.id === row.id
      ? { ...item, review_status: reviewStatus, updated_at: updatedAt }
      : item));
  };

  const openReplyDraft = (row: ReplyRow) => {
    setDraftId(row.id);
    setDraftText(buildProgramReplyTemplate({
      remoteName: row.remote_name,
      interestHours: row.interest_hours,
    }));
  };

  const copyReplyDraft = async () => {
    if (!draftText.trim()) return;
    try {
      await navigator.clipboard.writeText(draftText);
      toast.success("Ответ скопирован", {
        description: "Проверьте получателя и отправьте текст из исходного почтового ящика.",
      });
    } catch {
      toast.error("Не удалось скопировать ответ");
    }
  };

  const exportCandidates = () => {
    const csv = buildGroupIntakeCsv(summary.candidates, campaignNames);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "Реестр_группы_44-ФЗ.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Есть интерес", summary.interested],
          ["Отмечены для группы", summary.enrolled],
          ["Нужно проверить", summary.needsReview],
          ["Стоп-лист", summary.stopped],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="h-4 w-4 text-primary" /> Ответы кампаний
            </CardTitle>
            <p className="mt-2 text-xs text-muted-foreground">
              Система читает только новые ответы после контрольной IMAP-границы и не помечает письма прочитанными.
              Отписка и явный отказ сразу исключают адрес из следующих отправок.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-1 h-4 w-4" /> Обновить
            </Button>
            <Button variant="outline" size="sm" onClick={exportCandidates} disabled={summary.interested === 0}>
              <Download className="mr-1 h-4 w-4" /> Реестр группы CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.assign("/organization?tab=students&studentsView=groups")}
            >
              <Users className="mr-1 h-4 w-4" /> Открыть фактические группы
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant={baseline.ready === baseline.total && baseline.total > 0 ? "default" : "secondary"}>
              IMAP-граница: {baseline.ready}/{baseline.total}
            </Badge>
            {baseline.errors > 0 && <Badge variant="destructive">Ошибок IMAP: {baseline.errors}</Badge>}
            <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
              <SelectTrigger className="h-8 w-[190px]" aria-label="Фильтр ответов"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все ответы</SelectItem>
                {Object.entries(classificationLabel).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
            </p>
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ответов пока нет. После запуска они появятся здесь автоматически.</p>
          ) : (
            <div className="space-y-3">
              {visibleRows.map((row) => (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.remote_name || row.remote_email} · {row.remote_email}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(row.received_at).toLocaleString("ru-RU")} · {campaignNames[row.campaign_id] || "Кампания"}
                        {senderEmails[row.sender_id] ? ` · ответ на ${senderEmails[row.sender_id]}` : ""}
                      </p>
                    </div>
                    <Badge variant={row.classification === "interested" ? "default" : "outline"}>
                      {classificationLabel[row.classification]}{row.interest_hours ? ` · ${row.interest_hours} ч` : ""}
                    </Badge>
                    <Select
                      value={row.review_status}
                      onValueChange={(value) => void updateStatus(row, value as ReviewStatus)}
                      disabled={savingId === row.id}
                    >
                      <SelectTrigger className="h-8 w-[150px]" aria-label={`Статус ответа ${row.remote_email}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusLabel).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">{row.subject || "Ответ без темы"}</summary>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/40 p-3">{row.body_text || "Текст ответа отсутствует"}</p>
                  </details>
                  {(row.classification === "interested" || row.classification === "needs_review")
                    && row.review_status !== "enrolled" && row.review_status !== "closed" && (
                    <div className="mt-3">
                      {draftId !== row.id ? (
                        <Button variant="outline" size="sm" onClick={() => openReplyDraft(row)}>
                          <MessageSquareReply className="mr-1 h-4 w-4" /> Подготовить ответ с программой
                        </Button>
                      ) : (
                        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium">Черновик ответа — перед отправкой проверьте получателя и текст</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Закрыть черновик ответа"
                              onClick={() => setDraftId(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <Textarea
                            value={draftText}
                            onChange={(event) => setDraftText(event.target.value)}
                            className="min-h-[260px] bg-background"
                            aria-label={`Черновик ответа для ${row.remote_email}`}
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => void copyReplyDraft()} disabled={!draftText.trim()}>
                              <ClipboardCopy className="mr-1 h-4 w-4" /> Скопировать ответ
                            </Button>
                            <p className="text-xs text-muted-foreground">
                              Кнопка только копирует текст и ничего не отправляет автоматически.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {row.review_status === "enrolled" && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-primary">
                      <UserCheck className="h-3.5 w-3.5" /> Отмечен кандидатом для рабочей группы
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
