import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, Upload, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LeadsManager } from "./LeadsManager";

interface SourceBucket {
  source: string;
  total: number;
  untreated: number;
  lastImport: string | null;
}

export function ContactsHub() {
  const [buckets, setBuckets] = useState<SourceBucket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_leads")
      .select("source, status, assigned_manager_id, created_at")
      .limit(5000);
    if (error || !data) { setLoading(false); return; }
    const m = new Map<string, SourceBucket>();
    for (const l of data as any[]) {
      const src = l.source || "Загруженная база";
      const b = m.get(src) || { source: src, total: 0, untreated: 0, lastImport: null };
      b.total++;
      if (l.status === "new" && !l.assigned_manager_id) b.untreated++;
      if (!b.lastImport || (l.created_at && l.created_at > b.lastImport)) b.lastImport = l.created_at;
      m.set(src, b);
    }
    setBuckets([...m.values()].sort((a, b) => b.untreated - a.untreated));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totalUntreated = useMemo(() => buckets.reduce((s, b) => s + b.untreated, 0), [buckets]);

  return (
    <div className="space-y-4">
      {/* Hero: untreated buckets */}
      <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Inbox className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold">Необработанные базы</h3>
              {totalUntreated > 0 && (
                <Badge className="bg-amber-500 text-white">{totalUntreated} новых</Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              Контакты со статусом «Новый» без назначенного менеджера
            </span>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : buckets.length === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Базы не загружены. Импортируйте Excel в блоке ниже.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {buckets.map(b => (
                <div key={b.source} className="rounded-xl border bg-background/60 p-3 flex items-center gap-3">
                  <Database className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.source}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.total} контактов · {b.untreated > 0 ? <span className="text-amber-600 font-medium">{b.untreated} необработанных</span> : "все в работе"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full leads manager */}
      <LeadsManager />
    </div>
  );
}
