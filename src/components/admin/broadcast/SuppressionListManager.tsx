import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldX, Plus, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Suppression {
  id: string;
  email: string;
  scope: string;
  reason: string;
  created_at: string;
}

interface Props {
  scope: "platform" | "org";
  organizationId: string | null;
}

export function SuppressionListManager({ scope, organizationId }: Props) {
  const [items, setItems] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const scopeKey = scope === "platform" ? "platform" : (organizationId || "");

  const refresh = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("email_suppressions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (scope === "platform") {
        q = q.eq("scope", "platform");
      } else if (organizationId) {
        q = q.in("scope", [organizationId, "platform"]);
      }
      const { data, error } = await q;
      if (error) throw error;
      setItems((data || []) as Suppression[]);
    } catch (e: any) {
      toast.error("Ошибка загрузки: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [scope, organizationId]);

  const addManual = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Некорректный email");
      return;
    }
    setAdding(true);
    try {
      const { error } = await supabase.from("email_suppressions").insert({
        email,
        scope: scopeKey || "platform",
        reason: "manual",
      });
      if (error) throw error;
      toast.success("Адрес добавлен в список отписавшихся");
      setNewEmail("");
      refresh();
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить адрес из списка отписавшихся? Ему снова можно будет отправлять письма.")) return;
    try {
      const { error } = await supabase.from("email_suppressions").delete().eq("id", id);
      if (error) throw error;
      toast.success("Адрес удалён из списка");
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e: any) {
      toast.error("Ошибка: " + e.message);
    }
  };

  const filtered = items.filter(i => !search.trim() || i.email.includes(search.trim().toLowerCase()));

  const reasonLabel = (r: string) => {
    const map: Record<string, string> = {
      manual: "Вручную",
      unsubscribe: "Отписка",
      bounce: "Адрес недоступен",
      complaint: "Жалоба на спам",
    };
    return map[r] || r;
  };

  const reasonColor = (r: string) => {
    if (r === "complaint") return "bg-destructive/10 text-destructive";
    if (r === "bounce") return "bg-orange-500/10 text-orange-600";
    if (r === "unsubscribe") return "bg-blue-500/10 text-blue-600";
    return "bg-muted text-muted-foreground";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldX className="w-5 h-5" />
          Список отписавшихся ({items.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Этим адресам платформа никогда не отправит письма из кампаний — это защищает репутацию домена и помогает не попадать в спам.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Добавить email вручную (например, для блокировки)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addManual(); }}
            className="flex-1"
          />
          <Button onClick={addManual} disabled={adding || !newEmail.trim()} className="gap-1">
            <Plus className="w-4 h-4" /> Добавить
          </Button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Поиск по email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {search ? "Ничего не найдено" : "Список пуст. Это хорошо!"}
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
            {filtered.map(item => (
              <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20 text-sm">
                <span className="flex-1 truncate font-mono text-xs">{item.email}</span>
                <Badge className={reasonColor(item.reason)} variant="outline">{reasonLabel(item.reason)}</Badge>
                <span className="text-xs text-muted-foreground hidden md:inline">
                  {format(new Date(item.created_at), "d MMM yyyy", { locale: ru })}
                </span>
                <Button size="sm" variant="ghost" onClick={() => remove(item.id)} className="text-destructive h-7 w-7 p-0">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
