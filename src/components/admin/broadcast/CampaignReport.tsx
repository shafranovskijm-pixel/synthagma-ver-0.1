import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Recipient {
  id: string;
  email: string;
  recipient_name: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  opened_at: string | null;
}

export function CampaignReport({ campaignId, open, onClose }: { campaignId: string | null; open: boolean; onClose: () => void }) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !campaignId) return;
    setLoading(true);
    supabase
      .from("email_campaign_recipients")
      .select("id, email, recipient_name, status, error, sent_at, opened_at")
      .eq("campaign_id", campaignId)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(500)
      .then(({ data }) => {
        setRecipients((data || []) as Recipient[]);
        setLoading(false);
      });
  }, [campaignId, open]);

  const statusVariant = (s: string): any => {
    if (s === "sent" || s === "opened") return "default";
    if (s === "failed" || s === "bounced") return "destructive";
    return "secondary";
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Отчёт по кампании</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : (
          <div className="space-y-2">
            {recipients.length === 0 && <p className="text-sm text-muted-foreground">Получателей нет</p>}
            {recipients.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.email}</p>
                  {r.error && <p className="text-xs text-destructive truncate">{r.error}</p>}
                  {r.sent_at && (
                    <p className="text-xs text-muted-foreground">
                      Отправлено: {format(new Date(r.sent_at), "d MMM HH:mm", { locale: ru })}
                      {r.opened_at && ` · Открыто: ${format(new Date(r.opened_at), "d MMM HH:mm", { locale: ru })}`}
                    </p>
                  )}
                </div>
                <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
