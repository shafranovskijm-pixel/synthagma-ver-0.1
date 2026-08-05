import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Info } from "lucide-react";

interface Props {
  organizationId: string | null;
}

interface Row {
  email: string;
  campaigns: number;
  lastStatus: string;
  lastAt: string | null;
}

/**
 * Этап 1: база строится из истории существующих получателей кампаний
 * (email_campaign_recipients), новые таблицы не создаются.
 * Дедупликация по email выполняется на клиенте.
 */
export function MailingContactsTab({ organizationId }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicates, setDuplicates] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!organizationId) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: camps } = await supabase
        .from("email_campaigns")
        .select("id")
        .eq("scope", "org")
        .eq("organization_id", organizationId);
      const ids = (camps || []).map((c) => c.id);
      if (!ids.length) {
        if (!cancelled) {
          setRows([]);
          setDuplicates(0);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("email_campaign_recipients")
        .select("email, status, sent_at, opened_at")
        .in("campaign_id", ids)
        .limit(5000);
      if (cancelled) return;
      const map = new Map<string, Row>();
      let dup = 0;
      for (const r of data || []) {
        const key = (r.email || "").trim().toLowerCase();
        if (!key) continue;
        const at = (r.sent_at || r.opened_at) as string | null;
        const existing = map.get(key);
        if (existing) {
          dup++;
          existing.campaigns++;
          if (at && (!existing.lastAt || at > existing.lastAt)) {
            existing.lastAt = at;
            existing.lastStatus = r.status || existing.lastStatus;
          }
        } else {
          map.set(key, { email: key, campaigns: 1, lastStatus: r.status || "—", lastAt: at });
        }
      }
      setRows([...map.values()].sort((a, b) => (b.lastAt || "").localeCompare(a.lastAt || "")));
      setDuplicates(dup);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.email.includes(q)) : rows;
  }, [rows, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" />
          База контактов
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          На этом этапе база собирается из истории получателей существующих кампаний и
          дедуплицируется по email. Импорт CSV/XLSX и собственные поля появятся на следующем этапе.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по email"
            className="max-w-xs"
          />
          <Badge variant="outline">Уникальных: {rows.length}</Badge>
          <Badge variant="outline">Дубликатов свёрнуто: {duplicates}</Badge>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Получателей пока нет.</p>
        ) : (
          <div className="divide-y rounded-xl border">
            {filtered.slice(0, 200).map((r) => (
              <div key={r.email} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="flex-1 truncate">{r.email}</span>
                <span className="text-xs text-muted-foreground">кампаний: {r.campaigns}</span>
                <Badge variant="outline">{r.lastStatus}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
