import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, FileText, Search, Send, CheckCircle2, XCircle, AlertTriangle, Copy, Download, FileDown } from "lucide-react";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { downloadSignatureProtocol, exportSignaturesToCSV } from "@/utils/signatureProtocol";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
}

interface OrgInfo { name: string; inn: string | null; }

const STATUS_LABELS: Record<string, { label: string; cls: string; icon: any }> = {
  draft: { label: "Черновик", cls: "bg-muted text-muted-foreground", icon: FileText },
  sent: { label: "Отправлено", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: Send },
  viewed: { label: "Просмотрено", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: Eye },
  signed: { label: "Подписано", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: CheckCircle2 },
  rejected: { label: "Отклонено", cls: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
  expired: { label: "Просрочено", cls: "bg-orange-500/10 text-orange-600 border-orange-500/20", icon: AlertTriangle },
};

const TYPE_LABELS: Record<string, string> = {
  contract: "Договор",
  consent: "Согласие",
  act: "Акт",
  order: "Приказ",
  custom_pdf: "Документ",
  education_document: "Документ об образовании",
  pep_agreement: "Соглашение ПЭП",
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

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("document_signatures")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (error) { toast.error("Ошибка загрузки журнала"); setLoading(false); return; }
    const list = (data as any) || [];
    setRows(list);

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

  useEffect(() => { load(); }, [organizationId]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (typeFilter !== "all" && r.document_type !== typeFilter) return false;
      if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(r.created_at) > new Date(dateTo + "T23:59:59")) return false;
      if (search) {
        const s = search.toLowerCase();
        if (!r.document_title.toLowerCase().includes(s) &&
            !r.recipient_name.toLowerCase().includes(s) &&
            !r.recipient_email.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, typeFilter, dateFrom, dateTo, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, sent: 0, signed: 0, viewed: 0, rejected: 0, expired: 0 };
    rows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

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
        <TabsList>
          <TabsTrigger value="all">Все ({counts.all})</TabsTrigger>
          <TabsTrigger value="sent">Отправлено ({counts.sent || 0})</TabsTrigger>
          <TabsTrigger value="signed">Подписано ({counts.signed || 0})</TabsTrigger>
          <TabsTrigger value="rejected">Отклонено ({counts.rejected || 0})</TabsTrigger>
          <TabsTrigger value="expired">Просрочено ({counts.expired || 0})</TabsTrigger>
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
                        {r.status === "sent" && (
                          <Button variant="ghost" size="icon" title="Скопировать ссылку" onClick={() => copyLink(r.signature_token)}><Copy className="w-4 h-4" /></Button>
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

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2" onClick={() => copyLink(selected.signature_token)}>
                  <Copy className="w-4 h-4" />Скопировать ссылку
                </Button>
                <Button variant="outline" className="flex-1 gap-2" asChild>
                  <a href={`/sign/${selected.signature_token}`} target="_blank" rel="noopener noreferrer">
                    <Eye className="w-4 h-4" />Открыть страницу подписания
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
