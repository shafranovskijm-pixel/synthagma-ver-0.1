import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Row {
  id: string;
  email: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string;
  last_sent_at: string | null;
  source: string | null;
}

export function BroadcastCompaniesDb() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("broadcast_companies_db")
      .select("id, email, company_name, first_name, last_name, status, last_sent_at, source")
      .order("last_sent_at", { ascending: false })
      .limit(5000);
    if (error) toast.error(error.message);
    setRows((data as Row[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      r.email.toLowerCase().includes(s) ||
      (r.company_name || "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  const remove = async (id: string) => {
    if (!confirm("Удалить запись? Этот email снова сможет получать рассылки.")) return;
    const { error } = await supabase.from("broadcast_companies_db").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Удалено");
    setRows(prev => prev.filter(r => r.id !== id));
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по email или компании…"
              className="pl-8"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div className="text-xs text-muted-foreground ml-auto">
            Всего: <b className="text-foreground">{rows.length}</b>
            {q && <> · найдено: <b className="text-foreground">{filtered.length}</b></>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          В эту базу попадают все компании, которым уже была отправлена рассылка. Новые кампании автоматически пропускают эти адреса.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Загрузка…
          </div>
        ) : (
          <div className="border rounded-lg overflow-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Компания</th>
                  <th className="px-3 py-2 font-medium">Контакт</th>
                  <th className="px-3 py-2 font-medium">Отправлено</th>
                  <th className="px-3 py-2 font-medium">Источник</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs">{r.email}</td>
                    <td className="px-3 py-2 max-w-[380px] truncate" title={r.company_name || ""}>
                      {r.company_name || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.last_sent_at ? new Date(r.last_sent_at).toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.source || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground text-sm">Ничего не найдено</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
