import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Copy, Mail, Phone, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type Step = "all" | "submitted" | "success" | "failed";
type Period = "24h" | "7d" | "30d" | "all";

interface Attempt {
  id: string;
  step: string;
  email: string | null;
  phone: string | null;
  org_name: string | null;
  contact_name: string | null;
  inn: string | null;
  selected_plan: string | null;
  promo_code: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  page_url: string | null;
  referrer: string | null;
  error_message: string | null;
  ip: string | null;
  user_id: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

const stepBadge = (step: string) => {
  if (step === "success") return <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Успех</Badge>;
  if (step === "failed") return <Badge variant="destructive">Ошибка</Badge>;
  return <Badge variant="secondary">Отправлено</Badge>;
};

export default function RegistrationLeads() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("all");
  const [period, setPeriod] = useState<Period>("7d");
  const [search, setSearch] = useState("");

  const since = useMemo(() => {
    if (period === "all") return null;
    const d = new Date();
    if (period === "24h") d.setHours(d.getHours() - 24);
    else if (period === "7d") d.setDate(d.getDate() - 7);
    else if (period === "30d") d.setDate(d.getDate() - 30);
    return d.toISOString();
  }, [period]);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("registration_attempts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (since) q = q.gte("created_at", since);
    if (step !== "all") q = q.eq("step", step);
    const { data, error } = await q;
    if (error) toast.error("Ошибка загрузки", { description: error.message });
    setRows((data as Attempt[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [step, period]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      [r.email, r.phone, r.inn, r.org_name, r.contact_name]
        .some(v => v?.toLowerCase().includes(s))
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const success = filtered.filter(r => r.step === "success").length;
    const failed = filtered.filter(r => r.step === "failed").length;
    const submitted = filtered.filter(r => r.step === "submitted").length;
    const conv = total ? Math.round((success / total) * 100) : 0;
    return { total, success, failed, submitted, conv };
  }, [filtered]);

  const copyContact = (r: Attempt) => {
    const txt = [
      r.org_name && `Организация: ${r.org_name}`,
      r.contact_name && `Контакт: ${r.contact_name}`,
      r.email && `Email: ${r.email}`,
      r.phone && `Телефон: ${r.phone}`,
      r.inn && `ИНН: ${r.inn}`,
      r.selected_plan && `Тариф: ${r.selected_plan}`,
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(txt);
    toast.success("Скопировано");
  };

  const utmLabel = (r: Attempt) =>
    [r.utm_source, r.utm_medium, r.utm_campaign].filter(Boolean).join(" / ") || "—";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Лиды регистрации</h1>
              <p className="text-sm text-muted-foreground">
                Каждая попытка регистрации — успешная и нет. Звоните клиентам, у которых не получилось.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Обновить
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card><CardHeader className="p-4"><CardTitle className="text-xs text-muted-foreground">Всего</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-2xl font-bold">{stats.total}</CardContent></Card>
          <Card><CardHeader className="p-4"><CardTitle className="text-xs text-muted-foreground">Успех</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-2xl font-bold text-emerald-600">{stats.success}</CardContent></Card>
          <Card><CardHeader className="p-4"><CardTitle className="text-xs text-muted-foreground">Ошибки</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-2xl font-bold text-destructive">{stats.failed}</CardContent></Card>
          <Card><CardHeader className="p-4"><CardTitle className="text-xs text-muted-foreground">В процессе</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-2xl font-bold">{stats.submitted}</CardContent></Card>
          <Card><CardHeader className="p-4"><CardTitle className="text-xs text-muted-foreground">Конверсия</CardTitle></CardHeader><CardContent className="p-4 pt-0 text-2xl font-bold">{stats.conv}%</CardContent></Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3">
            <Select value={step} onValueChange={(v) => setStep(v as Step)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="failed">Только ошибки</SelectItem>
                <SelectItem value="success">Только успех</SelectItem>
                <SelectItem value="submitted">Отправлено</SelectItem>
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24 часа</SelectItem>
                <SelectItem value="7d">7 дней</SelectItem>
                <SelectItem value="30d">30 дней</SelectItem>
                <SelectItem value="all">Всё время</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Поиск: email, телефон, ИНН, организация…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[260px]"
            />
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Организация</TableHead>
                    <TableHead>Контакт</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>ИНН</TableHead>
                    <TableHead>Тариф</TableHead>
                    <TableHead>Источник</TableHead>
                    <TableHead>Ошибка</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Загрузка…</TableCell></TableRow>
                  )}
                  {!loading && filtered.length === 0 && (
                    <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Нет данных</TableCell></TableRow>
                  )}
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString("ru-RU")}</TableCell>
                      <TableCell>{stepBadge(r.step)}</TableCell>
                      <TableCell className="font-medium">{r.org_name || "—"}</TableCell>
                      <TableCell>{r.contact_name || "—"}</TableCell>
                      <TableCell className="text-xs">{r.email || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.phone || "—"}</TableCell>
                      <TableCell className="text-xs">{r.inn || "—"}</TableCell>
                      <TableCell className="text-xs">{r.selected_plan || "—"}</TableCell>
                      <TableCell className="text-xs">{utmLabel(r)}</TableCell>
                      <TableCell className="text-xs max-w-[260px] truncate text-destructive" title={r.error_message || ""}>
                        {r.error_message || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.phone && (
                            <Button asChild size="icon" variant="ghost" title="Позвонить">
                              <a href={`tel:${r.phone}`}><Phone className="h-4 w-4" /></a>
                            </Button>
                          )}
                          {r.email && (
                            <Button asChild size="icon" variant="ghost" title="Написать">
                              <a href={`mailto:${r.email}`}><Mail className="h-4 w-4" /></a>
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" title="Скопировать" onClick={() => copyContact(r)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
