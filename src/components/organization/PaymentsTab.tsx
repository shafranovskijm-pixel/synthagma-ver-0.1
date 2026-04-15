import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrgDashboard } from "@/contexts/OrgDashboardContext";
import { TBankSettings } from "./TBankSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SigmaSpinner } from "@/components/ui/SigmaSpinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CoursePayment {
  id: string;
  amount: number;
  status: string;
  email: string | null;
  created_at: string;
  paid_at: string | null;
  course_title?: string;
}

interface BalanceTx {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  created_at: string;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Ожидание", variant: "outline" },
  CONFIRMED: { label: "Оплачен", variant: "default" },
  paid: { label: "Оплачен", variant: "default" },
  failed: { label: "Ошибка", variant: "destructive" },
  REJECTED: { label: "Отклонён", variant: "destructive" },
  refunded: { label: "Возврат", variant: "secondary" },
};

export function PaymentsTab() {
  const { organizationId } = useOrgDashboard();
  const [balance, setBalance] = useState(0);
  const [payments, setPayments] = useState<CoursePayment[]>([]);
  const [transactions, setTransactions] = useState<BalanceTx[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    const [balRes, payRes, txRes] = await Promise.all([
      supabase.from("organizations").select("balance").eq("id", organizationId).single(),
      supabase
        .from("course_payments")
        .select("id, amount, status, email, created_at, paid_at, course_id, courses(title)")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("balance_transactions")
        .select("id, amount, type, description, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    setBalance(Number(balRes.data?.balance) || 0);
    setPayments(
      (payRes.data || []).map((p: any) => ({
        ...p,
        course_title: p.courses?.title || "—",
      }))
    );
    setTransactions(txRes.data || []);
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!organizationId) return null;

  const fmt = (n: number) => n.toLocaleString("ru-RU") + " ₽";
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const totalPaid = payments.filter(p => p.status === "CONFIRMED" || p.status === "paid").reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Финансы
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Обновить
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Баланс</p>
                <p className="text-xl font-bold">{fmt(balance)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <ArrowDownCircle className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Получено оплат</p>
                <p className="text-xl font-bold">{fmt(totalPaid)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
                <ArrowUpCircle className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Всего платежей</p>
                <p className="text-xl font-bold">{payments.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="payments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payments">Оплаты за курсы</TabsTrigger>
          <TabsTrigger value="transactions">Транзакции баланса</TabsTrigger>
          <TabsTrigger value="settings">Настройки кассы</TabsTrigger>
        </TabsList>

        <TabsContent value="payments">
          <Card>
            <CardHeader><CardTitle className="text-base">История оплат</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><SigmaSpinner size="md" /></div>
              ) : payments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Оплат пока нет</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">Дата</th>
                        <th className="py-2 pr-4">Курс</th>
                        <th className="py-2 pr-4">Email</th>
                        <th className="py-2 pr-4 text-right">Сумма</th>
                        <th className="py-2">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map(p => {
                        const st = statusMap[p.status] || { label: p.status, variant: "outline" as const };
                        return (
                          <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2.5 pr-4 whitespace-nowrap">{fmtDate(p.created_at)}</td>
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

        <TabsContent value="transactions">
          <Card>
            <CardHeader><CardTitle className="text-base">Транзакции баланса</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8"><SigmaSpinner size="md" /></div>
              ) : transactions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Транзакций пока нет</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-4">Дата</th>
                        <th className="py-2 pr-4">Тип</th>
                        <th className="py-2 pr-4">Описание</th>
                        <th className="py-2 text-right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(tx => (
                        <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="py-2.5 pr-4 whitespace-nowrap">{fmtDate(tx.created_at)}</td>
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

        <TabsContent value="settings">
          <TBankSettings organizationId={organizationId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
