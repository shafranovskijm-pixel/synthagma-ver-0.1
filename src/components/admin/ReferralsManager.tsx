import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, DollarSign, TrendingUp, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";

export function ReferralsManager() {
  const [partners, setPartners] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    const [p, po, c] = await Promise.all([
      supabase.from("referral_partners").select("*, profiles:user_id(full_name, email)").order("created_at", { ascending: false }),
      supabase.from("referral_payouts").select("*, referral_partners(code, user_id, profiles:user_id(full_name, email))").order("created_at", { ascending: false }),
      supabase.from("referral_commissions").select("*, referral_partners(code), organizations:organization_id(name)").order("created_at", { ascending: false }),
    ]);
    if (p.data) setPartners(p.data);
    if (po.data) setPayouts(po.data);
    if (c.data) setCommissions(c.data);
    setIsLoading(false);
  };

  const handleUpdateCommission = async (partnerId: string, newPercent: number) => {
    const { error } = await supabase
      .from("referral_partners")
      .update({ commission_percent: newPercent })
      .eq("id", partnerId);
    if (error) {
      toast.error("Ошибка", { description: getErrorMessage(error) });
    } else {
      toast.success("Комиссия обновлена");
      loadData();
    }
  };

  const handlePayoutAction = async (payoutId: string, action: "paid" | "rejected") => {
    const { error } = await supabase
      .from("referral_payouts")
      .update({ status: action, paid_at: action === "paid" ? new Date().toISOString() : null })
      .eq("id", payoutId);
    if (error) {
      toast.error(getErrorMessage(error));
    } else {
      // If paid, deduct from partner balance
      if (action === "paid") {
        const payout = payouts.find(p => p.id === payoutId);
        if (payout) {
          const partner = partners.find(p => p.id === payout.partner_id);
          if (partner) {
            await supabase
              .from("referral_partners")
              .update({ balance: Math.max(0, Number(partner.balance) - Number(payout.amount)) })
              .eq("id", partner.id);
          }
        }
      }
      toast.success(action === "paid" ? "Выплата одобрена" : "Выплата отклонена");
      loadData();
    }
  };

  const handleToggleStatus = async (partnerId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "blocked" : "active";
    await supabase.from("referral_partners").update({ status: newStatus }).eq("id", partnerId);
    toast.success("Статус изменён на ${newStatus}");
    loadData();
  };

  const totalPartners = partners.length;
  const totalEarned = partners.reduce((sum, p) => sum + Number(p.total_earned), 0);
  const pendingPayouts = payouts.filter(p => p.status === "pending").length;

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Users className="w-4 h-4" /> Партнёров</div>
            <div className="text-2xl font-bold">{totalPartners}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><TrendingUp className="w-4 h-4" /> Всего начислено</div>
            <div className="text-2xl font-bold">{totalEarned.toLocaleString("ru-RU")} ₽</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><DollarSign className="w-4 h-4" /> Ожидают выплаты</div>
            <div className="text-2xl font-bold">{pendingPayouts}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="partners">
        <TabsList>
          <TabsTrigger value="partners">Партнёры</TabsTrigger>
          <TabsTrigger value="payouts">Выплаты {pendingPayouts > 0 && <Badge variant="destructive" className="ml-2">{pendingPayouts}</Badge>}</TabsTrigger>
          <TabsTrigger value="commissions">Начисления</TabsTrigger>
        </TabsList>

        <TabsContent value="partners">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Партнёр</TableHead>
                    <TableHead>Код</TableHead>
                    <TableHead>Комиссия %</TableHead>
                    <TableHead>Баланс</TableHead>
                    <TableHead>Заработано</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{(p.profiles as any)?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{(p.profiles as any)?.email}</div>
                      </TableCell>
                      <TableCell><code className="text-xs">{p.code}</code></TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-20 h-8"
                          defaultValue={p.commission_percent}
                          onBlur={(e) => {
                            const val = parseInt(e.target.value);
                            if (val !== p.commission_percent && val >= 1 && val <= 50) {
                              handleUpdateCommission(p.id, val);
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>{Number(p.balance).toLocaleString("ru-RU")} ₽</TableCell>
                      <TableCell>{Number(p.total_earned).toLocaleString("ru-RU")} ₽</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "active" ? "default" : "destructive"}>
                          {p.status === "active" ? "Активен" : "Заблокирован"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => handleToggleStatus(p.id, p.status)}>
                          {p.status === "active" ? "Блокировать" : "Активировать"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Партнёр</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => {
                    const partnerData = p.referral_partners as any;
                    const profile = partnerData?.profiles;
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{profile?.full_name || partnerData?.code || "—"}</div>
                          <div className="text-xs text-muted-foreground">{profile?.email}</div>
                        </TableCell>
                        <TableCell className="font-medium">{Number(p.amount).toLocaleString("ru-RU")} ₽</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "paid" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>
                            {p.status === "paid" ? "Выплачено" : p.status === "pending" ? "Ожидает" : "Отклонено"}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(p.created_at).toLocaleDateString("ru-RU")}</TableCell>
                        <TableCell>
                          {p.status === "pending" && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="default" onClick={() => handlePayoutAction(p.id, "paid")}>
                                <CheckCircle className="w-3 h-3 mr-1" /> Одобрить
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handlePayoutAction(p.id, "rejected")}>
                                <XCircle className="w-3 h-3 mr-1" /> Отклонить
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commissions">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Партнёр</TableHead>
                    <TableHead>Организация</TableHead>
                    <TableHead>Платёж</TableHead>
                    <TableHead>Комиссия</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell><code className="text-xs">{(c.referral_partners as any)?.code || "—"}</code></TableCell>
                      <TableCell>{(c.organizations as any)?.name || "—"}</TableCell>
                      <TableCell>{Number(c.amount).toLocaleString("ru-RU")} ₽</TableCell>
                      <TableCell className="font-medium text-primary">{Number(c.commission_amount).toLocaleString("ru-RU")} ₽</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "paid" ? "default" : "secondary"}>
                          {c.status === "paid" ? "Выплачено" : "Начислено"}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(c.created_at).toLocaleDateString("ru-RU")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
