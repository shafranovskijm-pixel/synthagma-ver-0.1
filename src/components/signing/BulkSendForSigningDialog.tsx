/**
 * Массовая отправка одного и того же документа сразу нескольким получателям на ПЭП.
 * Используется для рассылок типовых договоров, согласий, актов сразу пачке учеников или компаний.
 */
import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Search, Users, CheckCircle2, AlertCircle, Building2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sha256Hex } from "@/utils/documentHash";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SendForSigningPayload } from "./SendForSigningDialog";

interface BulkRecipient {
  id: string;
  name: string;
  email: string;
  type: "student" | "company";
  user_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SendForSigningPayload | null;
  organizationId: string;
}

interface Result {
  recipient: BulkRecipient;
  ok: boolean;
  error?: string;
}

export function BulkSendForSigningDialog({ open, onOpenChange, payload, organizationId }: Props) {
  const [recipients, setRecipients] = useState<BulkRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "student" | "company">("all");
  const [expiresDays, setExpiresDays] = useState("7");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setSearch("");
    setResults(null);
    setProgress(null);

    const loadRecipients = async () => {
      setLoadingRecipients(true);
      const all: BulkRecipient[] = [];

      // Companies of this org
      const { data: companies } = await supabase
        .from("companies")
        .select("id, name, login_email, email, user_id")
        .eq("organization_id", organizationId);
      (companies || []).forEach((c: any) => {
        const email = c.login_email || c.email;
        if (email) all.push({ id: `company-${c.id}`, name: c.name, email, type: "company", user_id: c.user_id });
      });

      // Students of this org
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("user_id")
        .eq("organization_id", organizationId)
        .limit(1000);
      const userIds = Array.from(new Set((enrollments || []).map((e: any) => e.user_id))).slice(0, 500);
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);
        (profs || []).forEach((p: any) => {
          if (p.email) all.push({ id: `student-${p.user_id}`, name: p.full_name || p.email, email: p.email, type: "student", user_id: p.user_id });
        });
      }

      setRecipients(all);
      setLoadingRecipients(false);
    };
    loadRecipients();
  }, [open, organizationId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return recipients.filter(r => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (!s) return true;
      return r.name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s);
    });
  }, [recipients, search, filterType]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));

  const toggleAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach(r => next.delete(r.id));
      } else {
        filtered.forEach(r => next.add(r.id));
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!payload) return;
    const targets = recipients.filter(r => selectedIds.has(r.id));
    if (targets.length === 0) { toast.error("Не выбран ни один получатель"); return; }

    setSending(true);
    setProgress({ done: 0, total: targets.length });
    const results: Result[] = [];

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Нет авторизации");
      const documentHash = await sha256Hex(payload.documentHtml);
      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", user.id)
        .maybeSingle();
      const senderName = senderProfile?.full_name || senderProfile?.email || null;

      for (const r of targets) {
        try {
          const signatureToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
          const expires = new Date(Date.now() + Number(expiresDays || 7) * 24 * 60 * 60 * 1000).toISOString();

          const { data: inserted, error: insertErr } = await supabase
            .from("document_signatures")
            .insert({
              document_type: payload.documentType,
              document_id: payload.documentId ?? null,
              document_title: payload.documentTitle,
              document_html: payload.documentHtml,
              document_hash: documentHash,
              organization_id: payload.organizationId,
              sender_user_id: user.id,
              sender_name: senderName,
              recipient_type: r.type,
              recipient_user_id: r.user_id ?? null,
              recipient_email: r.email,
              recipient_name: r.name,
              signature_token: signatureToken,
              status: "sent",
              mode: "sign",
              expires_at: expires,
              sent_at: new Date().toISOString(),
            } as any)
            .select("id, signature_token")
            .single();

          if (insertErr) throw insertErr;

          // Best-effort email
          try {
            await supabase.functions.invoke("send-signing-email", {
              body: {
                signatureId: inserted.id,
                recipientEmail: r.email,
                recipientName: r.name,
                documentTitle: payload.documentTitle,
                signatureToken: inserted.signature_token,
              },
            });
          } catch (e) {
            console.warn("send-signing-email failed for", r.email, e);
          }

          results.push({ recipient: r, ok: true });
        } catch (err: any) {
          results.push({ recipient: r, ok: false, error: err?.message || "ошибка" });
        }
        setProgress({ done: results.length, total: targets.length });
      }

      setResults(results);
      const okCount = results.filter(r => r.ok).length;
      const failCount = results.length - okCount;
      if (failCount === 0) {
        toast.success(`Отправлено: ${okCount} получателям`);
      } else {
        toast.warning(`Отправлено: ${okCount}, ошибок: ${failCount}`);
      }
    } catch (e: any) {
      toast.error("Ошибка массовой отправки: " + (e?.message || ""));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !sending && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Массовая отправка на подписание
          </DialogTitle>
          <DialogDescription>
            {payload?.documentTitle && <span className="font-medium text-foreground">{payload.documentTitle}</span>}
            <br />
            Каждому получателю будет создана отдельная ссылка с собственным токеном. Email будет отправлен всем, у кого настроен SMTP.
          </DialogDescription>
        </DialogHeader>

        {results ? (
          <div className="flex-1 overflow-hidden flex flex-col gap-3">
            <div className="text-sm font-medium">Результаты отправки</div>
            <ScrollArea className="flex-1 border rounded-lg p-2">
              <div className="space-y-1">
                {results.map((r) => (
                  <div key={r.recipient.id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    {r.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{r.recipient.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.recipient.email}</div>
                    </div>
                    {!r.ok && r.error && (
                      <span className="text-xs text-destructive">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Готово</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по имени или email"
                  className="pl-9"
                  disabled={sending}
                />
              </div>
              <div className="flex gap-1">
                {(["all", "company", "student"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={cn(
                      "px-2.5 py-1.5 text-xs rounded-lg border transition-colors",
                      filterType === t ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 border-border hover:bg-muted"
                    )}
                  >
                    {t === "all" ? "Все" : t === "company" ? "Компании" : "Ученики"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} disabled={sending} />
              <span>Выбрать всех ({filtered.length})</span>
              <span className="ml-auto">
                <Badge variant="secondary">{selectedIds.size} выбрано</Badge>
              </span>
            </div>

            <ScrollArea className="flex-1 border rounded-lg min-h-[200px] max-h-[40vh]">
              {loadingRecipients ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Загрузка получателей...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Получатели не найдены</div>
              ) : (
                <div className="p-1">
                  {filtered.map((r) => {
                    const checked = selectedIds.has(r.id);
                    return (
                      <label
                        key={r.id}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted/50 transition-colors",
                          checked && "bg-primary/5"
                        )}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleOne(r.id)} disabled={sending} />
                        {r.type === "company" ? (
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{r.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.email}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            <div className="space-y-1.5">
              <Label className="text-xs">Срок действия ссылки (дней)</Label>
              <Input type="number" min={1} max={90} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} disabled={sending} className="w-32" />
            </div>

            {progress && (
              <div className="text-sm text-muted-foreground">
                Отправлено {progress.done} из {progress.total}…
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Отмена</Button>
              <Button onClick={handleSend} disabled={sending || selectedIds.size === 0} className="gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Отправить ({selectedIds.size})
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
