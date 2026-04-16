import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Building2, ArrowDownCircle, Search, RefreshCw, Settings2, ArrowUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminPaymentTester } from "./AdminPaymentTester";

interface PaymentRow {
  id: string;
  amount: number;
  status: string;
  email: string | null;
  created_at: string;
  paid_at: string | null;
  org_name: string;
  course_title: string;
}

interface CashRegister {
  organization_id: string;
  org_name: string;
  terminal_key: string;
  is_test_mode: boolean;
  payment_mode: string;
}

interface BalanceTx {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
  org_name: string;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ожидание", variant: "outline" },
  CONFIRMED: { label: "Оплачен", variant: "default" },
  paid: { label: "Оплачен", variant: "default" },
  failed: { label: "Ошибка", variant: "destructive" },
  REJECTED: { label: "Отклонён", variant: "destructive" },
  refunded: { label: "Возврат", variant: "secondary" },
};

export function AdminFinanceOverview() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [balanceTxs, setBalanceTxs] = useState<BalanceTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orgsWithPayments, setOrgsWithPayments] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const [payRes, cashRes, txRes] = await Promise.all([
      supabase
        .from("course_payments")
        .select("id, amount, status, email, created_at, paid_at, courses(title, organizations(name))")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("organization_payment_settings")
        .select("organization_id, terminal_key, is_test_mode, payment_mode, organizations(name)" as any)
        .order("organization_id"),
      supabase
        .from("balance_transactions")
        .select("id, amount, type, description, created_at, organizations(name)")
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const rows: PaymentRow[] = (payRes.data || []).map((p: any) => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      email: p.email,
      created_at: p.created_at,
      paid_at: p.paid_at,
      course_title: p.courses?.title || "—",
      org_name: p.courses?.organizations?.name || "—",
    }));
    setPayments(rows);
    setTotalRevenue(rows.filter(r => r.status === "CONFIRMED" || r.status === "paid").reduce((s, r) => s + r.amount, 0));
    setOrgsWithPayments(new Set(rows.map(r => r.org_name)).size);

    setCashRegisters((cashRes.data || []).map((c: any) => ({
      organization_id: c.organization_id,
      org_name: c.organizations?.name || "—",
      terminal_key: c.terminal_key,
      is_test_mode: c.is_test_mode,
      payment_mode: c.payment_mode || "redirect",
    })));

    setBalanceTxs((txRes.data || []).map((tx: any) => ({
      id: tx.id,
      amount: tx.amount,
      type: tx.type,
      description: tx.description,
      created_at: tx.created_at,
      org_name: tx.organizations?.name || "—",
    })));

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => n.toLocaleString("ru-RU") + " ₽";
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const filtered = payments.filter(p => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (p.email || "").toLowerCase().includes(q) ||
        p.course_title.toLowerCase().includes(q) ||
        p.org_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const maskKey = (key: string) => {
    if (!key || key.length < 8) return key || "—";
    return key.substring(0, 4) + "••••" + key.substring(key.length - 4);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Финансы платформы
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>

      {/* Summary */}
      <div className="grid sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Общая выручка</p>
                <p className="text-xl font-bold">{fmt(totalRevenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Всего платежей</p>
                <p className="text-xl font-bold">{payments.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Организаций</p>
                <p className="text-xl font-bold">{orgsWithPayments}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Settings2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Подключено касс</p>
                <p className="text-xl font-bold">{cashRegisters.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="payments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payments">Все платежи</TabsTrigger>
          <TabsTrigger value="registers">Настройки касс</TabsTrigger>
          <TabsTrigger value="transactions">Транзакции баланса</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по email, курсу или организации..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="pending">Ожидание</SelectItem>
                <SelectItem value="CONFIRMED">Оплачен</SelectItem>
                <SelectItem value="failed">Ошибка</SelectItem>
                <SelectItem value="refunded">Возврат</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center py-8"><SigmaSpinner size="md" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Платежей не найдено</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">Дата</th>
                        <th className="py-2 pr-4">Организация</th>
                        <th className="py-2 pr-4">Курс</th>
                        <th className="py-2 pr-4">Плательщик</th>
                        <th className="py-2 pr-4 text-right">Сумма</th>
                        <th className="py-2">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(p => {
                        const st = statusMap[p.status] || { label: p.status, variant: "outline" as const };
                        return (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2.5 pr-4 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                            <td className="py-2.5 pr-4 max-w-[150px] truncate">{p.org_name}</td>
                            <td className="py-2.5 pr-4 max-w-[200px] truncate">{p.course_title}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{p.email || "—"}</td>
                            <td className="py-2.5 pr-4 text-right font-medium">{fmt(p.amount)}</td>
                            <td className="py-2.5"><Badge variant={st.variant}>{st.label}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registers">
          <Card>
            <CardHeader><CardTitle className="text-base">Настройки касс организаций</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><SigmaSpinner size="md" /></div>
              ) : cashRegisters.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Ни одна организация не подключила кассу</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">Организация</th>
                        <th className="py-2 pr-4">TerminalKey</th>
                        <th className="py-2 pr-4">Режим</th>
                        <th className="py-2">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashRegisters.map(c => (
                        <tr key={c.organization_id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2.5 pr-4">{c.org_name}</td>
                          <td className="py-2.5 pr-4 font-mono text-xs">{maskKey(c.terminal_key)}</td>
                          <td className="py-2.5 pr-4">
                            <Badge variant="outline">{c.payment_mode === "widget" ? "Виджет" : "Редирект"}</Badge>
                          </td>
                          <td className="py-2.5">
                            <Badge variant={c.is_test_mode ? "secondary" : "default"}>
                              {c.is_test_mode ? "Тестовый" : "Боевой"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader><CardTitle className="text-base">Транзакции баланса (все организации)</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><SigmaSpinner size="md" /></div>
              ) : balanceTxs.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Транзакций нет</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">Дата</th>
                        <th className="py-2 pr-4">Организация</th>
                        <th className="py-2 pr-4">Тип</th>
                        <th className="py-2 pr-4">Описание</th>
                        <th className="py-2 text-right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {balanceTxs.map(tx => (
                        <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2.5 pr-4 whitespace-nowrap">{fmtDate(tx.created_at)}</td>
                          <td className="py-2.5 pr-4 max-w-[150px] truncate">{tx.org_name}</td>
                          <td className="py-2.5 pr-4">
                            <Badge variant={tx.amount >= 0 ? "default" : "secondary"}>
                              {tx.type === "topup" ? "Пополнение" : tx.type === "purchase" ? "Покупка" : tx.type}
                            </Badge>
                          </td>
                          <td className="py-2.5 pr-4 text-muted-foreground max-w-[250px] truncate">{tx.description || "—"}</td>
                          <td className={`py-2.5 text-right font-medium ${tx.amount >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                            {tx.amount >= 0 ? "+" : ""}{fmt(tx.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
