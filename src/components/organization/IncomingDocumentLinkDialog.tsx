import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Link2, FileText, Unlink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface SignatureOption {
  id: string;
  document_title: string;
  document_type: string;
  recipient_name: string;
  recipient_email: string;
  status: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  incomingDocId: string;
  currentLinkedId?: string | null;
  /** Подсказка для предзаполненного поиска (например, ИНН/название контрагента) */
  hint?: string;
  onLinked: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлено",
  viewed: "Просмотрено",
  signed: "Подписано",
  rejected: "Отклонено",
  revoked: "Отозвано",
  expired: "Просрочено",
  in_review: "На согласовании",
  changes_requested: "Правки",
};

export function IncomingDocumentLinkDialog({
  open, onOpenChange, organizationId, incomingDocId, currentLinkedId, hint, onLinked,
}: Props) {
  const [search, setSearch] = useState(hint || "");
  const [rows, setRows] = useState<SignatureOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { if (open) setSearch(hint || ""); }, [open, hint]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      let q = supabase
        .from("document_signatures")
        .select("id, document_title, document_type, recipient_name, recipient_email, status, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);
      const s = search.trim().replace(/[,()]/g, " ");
      if (s) q = q.or(`document_title.ilike.%${s}%,recipient_name.ilike.%${s}%,recipient_email.ilike.%${s}%`);
      const { data } = await q;
      setRows((data as any) || []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [open, organizationId, search]);

  const link = async (signatureId: string | null) => {
    setBusyId(signatureId || "__unlink__");
    try {
      const { error } = await supabase
        .from("incoming_documents")
        .update({ related_signature_id: signatureId })
        .eq("id", incomingDocId);
      if (error) throw error;
      toast.success(signatureId ? "Документ привязан к договору" : "Связь удалена");
      onLinked();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Не удалось привязать", { description: e?.message || String(e) });
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(() => rows, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-primary" />
            Привязать к отправленному договору
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию документа или получателю"
              className="pl-9"
              autoFocus
            />
          </div>

          {currentLinkedId && (
            <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-sm">
              <span className="text-warning-foreground">Уже связан с договором из журнала подписаний</span>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => link(null)}
                disabled={busyId !== null}
              >
                <Unlink className="w-4 h-4" />Снять связь
              </Button>
            </div>
          )}

          <div className="border rounded-xl divide-y max-h-[55vh] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Загрузка...</div>
            ) : visible.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Не найдено отправленных документов{search ? " по этому запросу" : ""}.
              </div>
            ) : (
              visible.map((r) => (
                <div key={r.id} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{r.document_title}</span>
                      <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[r.status] || r.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      → {r.recipient_name} · {r.recipient_email}
                    </div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      Создан {format(new Date(r.created_at), "d MMM yyyy", { locale: ru })}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={r.id === currentLinkedId ? "secondary" : "outline"}
                    onClick={() => link(r.id)}
                    disabled={busyId !== null || r.id === currentLinkedId}
                  >
                    {r.id === currentLinkedId ? "Текущая связь" : "Привязать"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Закрыть</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
