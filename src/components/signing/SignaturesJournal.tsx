import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, FileText, Search, Send, CheckCircle2, XCircle, AlertTriangle, Copy, Download, FileDown, MessageCircle, Edit3, Award } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { downloadSignatureProtocol, exportSignaturesToCSV } from "@/utils/signatureProtocol";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignatureRevisionUploader } from "@/components/signing/SignatureRevisionUploader";
import { Upload, PenLine } from "lucide-react";
import { LoadMoreControls } from "@/components/ui/LoadMoreControls";

interface SignatureRow {
  id: string;
  document_type: string;
  document_title: string;
  document_html: string | null;
  document_hash: string | null;
  organization_id: string;
  sender_name: string | null;
  recipient_type: string;
  recipient_email: string;
  recipient_name: string;
  status: string;
  signature_token: string;
  signed_at: string | null;
  signed_ip: string | null;
  signed_user_agent: string | null;
  sent_at: string | null;
  created_at: string;
  expires_at: string;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  signed_document_path?: string | null;
}

interface OrgInfo { name: string; inn: string | null; }

const STATUS_LABELS: Record<string, { label: string; cls: string; icon: any }> = {
  draft: { label: "Черновик", cls: "bg-muted text-muted-foreground", icon: FileText },
  sent: { label: "Отправлено", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Send },
  viewed: { label: "Просмотрено", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Eye },
  signed: { label: "Подписано", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  rejected: { label: "Отклонено", cls: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
  expired: { label: "Просрочено", cls: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: AlertTriangle },
  in_review: { label: "На согласовании", cls: "bg-violet-500/10 text-violet-600 border-violet-500/20", icon: Edit3 },
  changes_requested: { label: "Запрошены правки", cls: "bg-pink-500/10 text-pink-600 border-pink-500/20", icon: MessageCircle },
};

const TYPE_LABELS: Record<string, string> = {
  contract: "Договор",
  consent: "Согласие",
  act: "Акт",
  order: "Приказ",
  custom_pdf: "Документ",
  education_document: "Документ об образовании",
  pep_agreement: "Соглашение ПЭП",
  external_upload: "Загруженный договор",
};

interface Props {
  /** Если задано — фильтруем по этой организации (орг-кабинет). Если undefined — показываем все (админка). */
  organizationId?: string;
}

export function SignaturesJournal({ organizationId }: Props) {
  const [rows, setRows] = useState<SignatureRow[]>([]);
  const [orgs, setOrgs] = useState<Record<string, OrgInfo>>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SignatureRow | null>(null);
  const [pageSize, setPageSize] = useState(200);
  const [totalCount, setTotalCount] = useState(0);

  const load = async (limit = pageSize) => {
    setLoading(true);
    // Серверные фильтры (статус, тип, даты) + поиск по ILIKE через .or()
    let q = supabase
      .from("document_signatures")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (organizationId) q = q.eq("organization_id", organizationId);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (typeFilter !== "all") q = q.eq("document_type", typeFilter);
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");
    if (search.trim()) {
      const s = search.trim().replace(/[,()]/g, " ");
      q = q.or(`document_title.ilike.%${s}%,recipient_name.ilike.%${s}%,recipient_email.ilike.%${s}%`);
    }
    const { data, error, count } = await q;
    if (error) { toast.error("Ошибка загрузки журнала"); setLoading(false); return; }
    const list = (data as any) || [];
    setRows(list);
    setTotalCount(count || list.length);

    // Подгружаем названия организаций (для админки — все, для орг-кабинета — одна)
    const orgIds = Array.from(new Set(list.map((r: any) => r.organization_id))) as string[];
    if (orgIds.length) {
      const { data: orgList } = await supabase.from("organizations").select("id, name, inn").in("id", orgIds);
      const map: Record<string, OrgInfo> = {};
      (orgList || []).forEach((o: any) => { map[o.id] = { name: o.name, inn: o.inn }; });
      setOrgs(map);
    }
    setLoading(false);
  };

  // Перезагрузка при смене организации, фильтров, диапазона дат и debounced-поиска
  useEffect(() => {
    setPageSize(200);
    load(200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, statusFilter, typeFilter, dateFrom, dateTo]);

  useEffect(() => {
    const t = setTimeout(() => { setPageSize(200); load(200); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const loadMore = (extra: number) => {
    const next = pageSize + extra;
    setPageSize(next);
    load(next);
  };

  // Серверная фильтрация — отображаем все полученные строки
  const filtered = rows;

  // Счётчики статусов считаются по уже отфильтрованной выборке.
  // Когда фильтр активен — показываем totalCount для активного таба, остальные — 0.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, sent: 0, signed: 0, viewed: 0, rejected: 0, expired: 0, in_review: 0, changes_requested: 0, external_upload: 0 };
    if (statusFilter === "all") {
      c.all = totalCount;
      rows.forEach((r) => {
        c[r.status] = (c[r.status] || 0) + 1;
        if (r.document_type === "external_upload") c.external_upload++;
      });
    } else {
      c.all = totalCount;
      c[statusFilter] = totalCount;
    }
    return c;
  }, [rows, totalCount, statusFilter]);

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/sign/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("Ссылка скопирована");
  };

  const handleDownloadProtocol = (r: SignatureRow) => {
    const org = orgs[r.organization_id];
    downloadSignatureProtocol({
      documentTitle: r.document_title,
      documentType: r.document_type,
      documentHash: r.document_hash,
      organizationName: org?.name,
      organizationInn: org?.inn,
      senderName: r.sender_name,
      recipientName: r.recipient_name,
      recipientEmail: r.recipient_email,
      recipientType: r.recipient_type,
      status: r.status,
      createdAt: r.created_at,
      sentAt: r.sent_at,
      signedAt: r.signed_at,
      signedIp: r.signed_ip,
      signedUserAgent: r.signed_user_agent,
      rejectedAt: r.rejected_at,
      rejectionReason: r.rejection_reason,
      expiresAt: r.expires_at,
      signatureToken: r.signature_token,
    });
  };

  const handleDownloadCertificate = async (r: SignatureRow) => {
    try {
      let path = r.signed_document_path;
      if (!path) {
        // Попробуем сгенерировать сейчас (если ещё не сгенерирован)
        const { data, error } = await supabase.functions.invoke("generate-signature-certificate", {
          body: { signature_id: r.id },
        });
        if (error) throw error;
        path = data?.path;
        if (!path) throw new Error("Сертификат не сформирован");
      }
      const { data: signed, error: signErr } = await supabase.storage
        .from("signed-documents")
        .createSignedUrl(path, 600);
      if (signErr || !signed?.signedUrl) throw signErr || new Error("URL не получен");
      const a = document.createElement("a");
      a.href = signed.signedUrl;
      a.download = `signature-certificate-${r.id}.pdf`;
      a.target = "_blank";
      document.body.appendChild(a); a.click(); a.remove();
      toast.success("Сертификат подписи загружен");
    } catch (e: any) {
      toast.error("Не удалось скачать сертификат", { description: e?.message || String(e) });
    }
  };

  const handleExportCsv = () => {
    if (!filtered.length) { toast.error("Нет данных для экспорта"); return; }
    exportSignaturesToCSV(filtered);
    toast.success(`Экспортировано записей: ${filtered.length}`);
  };

  const uniqueTypes = useMemo(() => {
    const set = new Set(rows.map((r) => r.document_type));
    return Array.from(set);
  }, [rows]);

  if (loading) {
    return <div className="flex justify-center py-16"><SigmaSpinner size="lg" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по документу или получателю" className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Тип документа" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {uniqueTypes.map((t) => (
              <SelectItem key={t} value={t}>{TYPE_LABELS[t] || t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" placeholder="С" title="Создано с" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" placeholder="По" title="Создано по" />
        <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCsv}>
          <FileDown className="w-4 h-4" />CSV
        </Button>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">Все ({counts.all})</TabsTrigger>
          <TabsTrigger value="in_review">На согласовании ({counts.in_review || 0})</TabsTrigger>
          <TabsTrigger value="changes_requested">Правки ({counts.changes_requested || 0})</TabsTrigger>
          <TabsTrigger value="sent">Отправлено ({counts.sent || 0})</TabsTrigger>
          <TabsTrigger value="signed">Подписано ({counts.signed || 0})</TabsTrigger>
          <TabsTrigger value="rejected">Отклонено ({counts.rejected || 0})</TabsTrigger>
          <TabsTrigger value="expired">Просрочено ({counts.expired || 0})</TabsTrigger>
          {!organizationId && (
            <TabsTrigger
              value="__external"
              onClick={(e) => { e.preventDefault(); setStatusFilter("all"); setTypeFilter("external_upload"); }}
            >
              Входящие договоры ({counts.external_upload || 0})
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Нет записей о подписаниях</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Документ</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Получатель</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Отправлено</TableHead>
                <TableHead>Подписано</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const st = STATUS_LABELS[r.status] || STATUS_LABELS.draft;
                const StIcon = st.icon;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium max-w-[280px] truncate">{r.document_title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{TYPE_LABELS[r.document_type] || r.document_type}</TableCell>
                    <TableCell>
                      <div className="text-sm">{r.recipient_name}</div>
                      <div className="text-xs text-muted-foreground">{r.recipient_email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={st.cls}>
                        <StIcon className="w-3 h-3 mr-1" />{st.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.sent_at ? format(new Date(r.sent_at), "d MMM yyyy HH:mm", { locale: ru }) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.signed_at ? format(new Date(r.signed_at), "d MMM yyyy HH:mm", { locale: ru }) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" title="Подробнее" onClick={() => setSelected(r)}><Eye className="w-4 h-4" /></Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Обсудить документ"
                          onClick={() => {
                            const subject = encodeURIComponent(`Документ: ${r.document_title}`);
                            const body = encodeURIComponent(`Здравствуйте, ${r.recipient_name}!\n\nХочу обсудить документ «${r.document_title}».\n\nСсылка: ${window.location.origin}/sign/${r.signature_token}`);
                            window.open(`mailto:${r.recipient_email}?subject=${subject}&body=${body}`, "_blank");
                          }}
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                        {(r.status === "sent" || r.status === "in_review" || r.status === "changes_requested") && (
                          <Button variant="ghost" size="icon" title="Скопировать ссылку" onClick={() => copyLink(r.signature_token)}><Copy className="w-4 h-4" /></Button>
                        )}
                        {r.status === "signed" && (
                          <>
                            <Button variant="ghost" size="icon" title="Скачать протокол (HTML)" onClick={() => handleDownloadProtocol(r)}><Download className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" title="Сертификат подписи (PDF)" onClick={() => handleDownloadCertificate(r)}><Award className="w-4 h-4 text-emerald-600" /></Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {filtered.length > 0 && (
        <LoadMoreControls
          visibleCount={rows.length}
          totalCount={totalCount}
          onLoadMore={loadMore}
        />
      )}

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected?.document_title}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Тип:</span> {TYPE_LABELS[selected.document_type] || selected.document_type}</div>
                <div><span className="text-muted-foreground">Статус:</span> {STATUS_LABELS[selected.status]?.label || selected.status}</div>
                <div><span className="text-muted-foreground">Получатель:</span> {selected.recipient_name}</div>
                <div><span className="text-muted-foreground">Email:</span> {selected.recipient_email}</div>
                <div><span className="text-muted-foreground">Отправил:</span> {selected.sender_name || "—"}</div>
                <div><span className="text-muted-foreground">Действует до:</span> {format(new Date(selected.expires_at), "d MMM yyyy HH:mm", { locale: ru })}</div>
              </div>

              {(selected.status === "in_review" || selected.status === "changes_requested") && (
                <SignatureCommentsPanel signatureId={selected.id} />
              )}

              {selected.document_type === "external_upload" && (
                <SignatureFilesPanel
                  signatureId={selected.id}
                  organizationId={selected.organization_id}
                  status={selected.status}
                  requiresBilateral={(selected as any).requires_bilateral}
                  senderSignedAt={(selected as any).sender_signed_at}
                  onChanged={load}
                />
              )}

              {selected.status === "signed" && (
                <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                  <div className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />Доказательства подписи
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Дата подписания:</span> {selected.signed_at ? format(new Date(selected.signed_at), "d MMM yyyy HH:mm:ss", { locale: ru }) : "—"}</div>
                    <div><span className="text-muted-foreground">IP-адрес:</span> {selected.signed_ip || "—"}</div>
                    <div className="col-span-2"><span className="text-muted-foreground">User-Agent:</span> <span className="font-mono text-[10px]">{selected.signed_user_agent || "—"}</span></div>
                    <div className="col-span-2"><span className="text-muted-foreground">SHA-256 документа:</span> <span className="font-mono text-[10px] break-all">{selected.document_hash}</span></div>
                  </div>
                </div>
              )}

              {selected.document_html && (
                <div className="border rounded-lg overflow-hidden bg-white">
                  <iframe srcDoc={selected.document_html} className="w-full h-[400px]" title="Документ" />
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="flex-1 gap-2 min-w-[180px]" onClick={() => copyLink(selected.signature_token)}>
                  <Copy className="w-4 h-4" />Скопировать ссылку
                </Button>
                <Button variant="outline" className="flex-1 gap-2 min-w-[180px]" asChild>
                  <a href={`/sign/${selected.signature_token}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="w-4 h-4" />Открыть страницу подписания
                  </a>
                </Button>
                {selected.status === "signed" && (
                  <>
                    <Button variant="outline" className="flex-1 gap-2 min-w-[180px]" onClick={() => handleDownloadProtocol(selected)}>
                      <Download className="w-4 h-4" />Протокол (HTML)
                    </Button>
                    <Button variant="default" className="flex-1 gap-2 min-w-[180px]" onClick={() => handleDownloadCertificate(selected)}>
                      <Award className="w-4 h-4" />Сертификат подписи (PDF)
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Панель комментариев и версий по signature_id (для отправителя) */
function SignatureCommentsPanel({ signatureId }: { signatureId: string }) {
  const [comments, setComments] = useState<any[]>([]);
  const [revisions, setRevisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const sb: any = supabase;
      const [cRes, rRes] = await Promise.all([
        sb.from("signature_comments").select("*").eq("signature_id", signatureId).order("created_at", { ascending: true }),
        sb.from("signature_revisions").select("*").eq("signature_id", signatureId).order("version", { ascending: true }),
      ]);
      setComments(cRes.data || []);
      setRevisions(rRes.data || []);
      setLoading(false);
    })();
  }, [signatureId]);

  if (loading) return <div className="py-4 text-center text-sm text-muted-foreground">Загрузка комментариев…</div>;

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
      <div className="font-semibold text-violet-700 dark:text-violet-400 flex items-center gap-2">
        <MessageCircle className="w-5 h-5" />
        Согласование документа
        {revisions.length > 0 && <Badge variant="secondary">Версия {revisions.length}</Badge>}
      </div>

      {comments.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">Комментариев от получателя пока нет.</div>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="bg-background rounded-md border p-2.5 text-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium">{c.author_name} <span className="text-muted-foreground">· {c.author_role}</span></div>
                <div className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString("ru-RU")}</div>
              </div>
              {c.quoted_text && (
                <blockquote className="text-[11px] italic border-l-2 border-amber-400 pl-1.5 mb-1 text-muted-foreground line-clamp-2">
                  «{c.quoted_text}»
                </blockquote>
              )}
              <div className="text-xs whitespace-pre-wrap">{c.comment_text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Панель файлов-версий для внешне загруженных договоров */
function SignatureFilesPanel({ signatureId, organizationId, status, requiresBilateral, senderSignedAt, onChanged }: {
  signatureId: string; organizationId: string; status: string;
  requiresBilateral?: boolean; senderSignedAt?: string | null; onChanged: () => void;
}) {
  const [revisions, setRevisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploader, setShowUploader] = useState(false);
  const [countersigning, setCountersigning] = useState(false);

  const loadRev = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("signature_revisions").select("*")
      .eq("signature_id", signatureId).order("version", { ascending: false });
    setRevisions((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { loadRev(); }, [signatureId]);

  const downloadFile = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("external-contracts").createSignedUrl(path, 600);
    if (error || !data?.signedUrl) { toast.error("Не удалось получить ссылку"); return; }
    const a = document.createElement("a");
    a.href = data.signedUrl; a.download = name; a.target = "_blank";
    document.body.appendChild(a); a.click(); a.remove();
  };

  const countersign = async () => {
    setCountersigning(true);
    try {
      let ip = "unknown";
      try { const r = await fetch("https://api.ipify.org?format=json"); const j = await r.json(); ip = j.ip || "unknown"; } catch {}
      const { error } = await (supabase as any).rpc("sender_countersign", {
        p_signature_id: signatureId, p_ip: ip, p_user_agent: navigator.userAgent,
      });
      if (error) throw error;
      toast.success("Документ подписан с вашей стороны");
      onChanged(); loadRev();
    } catch (e: any) {
      toast.error("Не удалось поставить подпись", { description: e?.message || String(e) });
    } finally { setCountersigning(false); }
  };

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
      <div className="font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
        <FileText className="w-5 h-5" />Версии документа
        {revisions.length > 0 && <Badge variant="secondary">v{revisions[0].version}</Badge>}
      </div>

      {loading ? (
        <div className="py-2 text-sm text-muted-foreground">Загрузка…</div>
      ) : revisions.length === 0 ? (
        <div className="py-2 text-sm text-muted-foreground">Версий нет</div>
      ) : (
        <div className="space-y-1.5">
          {revisions.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-background rounded-md border p-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium flex items-center gap-2">
                  <Badge variant="outline">v{r.version}</Badge>
                  <span className="truncate">{r.file_name || "без файла"}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {r.created_by_name} · {new Date(r.created_at).toLocaleString("ru-RU")}
                  {r.change_summary ? ` · ${r.change_summary}` : ""}
                </div>
              </div>
              {r.file_url && (
                <Button variant="ghost" size="icon" onClick={() => downloadFile(r.file_url, r.file_name || "document")}>
                  <Download className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {(status === "in_review" || status === "changes_requested" || status === "sent") && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowUploader(true)}>
            <Upload className="w-3.5 h-3.5" />Загрузить новую версию
          </Button>
        )}
        {requiresBilateral && status === "signed" && !senderSignedAt && (
          <Button size="sm" className="gap-1.5" onClick={countersign} disabled={countersigning}>
            <PenLine className="w-3.5 h-3.5" />Подписать с моей стороны
          </Button>
        )}
        {requiresBilateral && senderSignedAt && (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3 mr-1" />Встречная подпись поставлена
          </Badge>
        )}
      </div>

      <SignatureRevisionUploader
        open={showUploader} onOpenChange={setShowUploader}
        signatureId={signatureId} organizationId={organizationId}
        title="Загрузить новую версию"
        onUploaded={() => { loadRev(); onChanged(); }}
      />
    </div>
  );
}
