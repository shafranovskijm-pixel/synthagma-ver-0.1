import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreditCard, Download, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Payment {
  id: string;
  course_id: string;
  user_id: string | null;
  amount: number;
  status: string;
  email: string | null;
  paid_at: string | null;
  created_at: string;
  robokassa_inv_id: number | null;
  course?: { title: string } | null;
  profile?: { full_name: string; email: string } | null;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ожидает", variant: "secondary" },
  paid: { label: "Оплачен", variant: "default" },
  failed: { label: "Ошибка", variant: "destructive" },
  refunded: { label: "Возврат", variant: "outline" },
};

export function PaymentsTab() {
  const d = useOrgDashboard();
  const organizationId = d.organizationId;
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");

  useEffect(() => {
    if (!organizationId) return;
    fetchPayments();
  }, [organizationId]);

  const fetchPayments = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("course_payments")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch course titles and user names
      const courseIds = [...new Set((data || []).map(p => p.course_id))];
      const userIds = [...new Set((data || []).filter(p => p.user_id).map(p => p.user_id!))];

      const [coursesRes, profilesRes] = await Promise.all([
        courseIds.length > 0 ? supabase.from("courses").select("id, title").in("id", courseIds) : { data: [] },
        userIds.length > 0 ? supabase.from("profiles").select("user_id, full_name, email").in("user_id", userIds) : { data: [] },
      ]);

      const coursesMap = new Map((coursesRes.data || []).map(c => [c.id, c]));
      const profilesMap = new Map((profilesRes.data || []).map(p => [p.user_id, p]));

      setPayments((data || []).map(p => ({
        ...p,
        course: coursesMap.get(p.course_id) || null,
        profile: p.user_id ? profilesMap.get(p.user_id) || null : null,
      })));
    } catch (err) {
      console.error("Error fetching payments:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = payments.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (monthFilter !== "all") {
      const d = new Date(p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key !== monthFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const name = p.profile?.full_name?.toLowerCase() || "";
      const email = (p.profile?.email || p.email || "").toLowerCase();
      const course = p.course?.title?.toLowerCase() || "";
      if (!name.includes(q) && !email.includes(q) && !course.includes(q)) return false;
    }
    return true;
  });

  const totalPaid = filtered.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0);

  const months = [...new Set(payments.map(p => {
    const d = new Date(p.created_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }))].sort().reverse();

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Финансы
        </h2>
        <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl font-semibold">
          Итого оплачено: {totalPaid.toLocaleString("ru-RU")} ₽
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Поиск по имени, email или курсу..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Статус" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="paid">Оплачен</SelectItem>
            <SelectItem value="pending">Ожидает</SelectItem>
            <SelectItem value="failed">Ошибка</SelectItem>
            <SelectItem value="refunded">Возврат</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Месяц" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все месяцы</SelectItem>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {format(new Date(m + "-01"), "LLLL yyyy", { locale: ru })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Нет оплат</p>
          <p className="text-sm mt-1">Оплаты появятся здесь, когда слушатели оплатят курсы</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Слушатель</TableHead>
                <TableHead>Курс</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(p => {
                const st = STATUS_MAP[p.status] || STATUS_MAP.pending;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(p.paid_at || p.created_at), "dd.MM.yyyy HH:mm", { locale: ru })}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{p.profile?.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.profile?.email || p.email || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm">{p.course?.title || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{Number(p.amount).toLocaleString("ru-RU")} ₽</TableCell>
                    <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
