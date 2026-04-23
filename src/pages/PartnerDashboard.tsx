import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Copy, TrendingUp, Users, DollarSign, Wallet, ArrowLeft, Network, Crown, Award, ChevronRight, FileText, Megaphone, BookOpen } from "lucide-react";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { toast } from "sonner";
import { getErrorMessage } from "@/utils/handleSupabaseError";
import { PartnerNetworkTree } from "@/components/partner/PartnerNetworkTree";
import { PartnerMaterials } from "@/components/partner/PartnerMaterials";
import { PartnerHowItWorks } from "@/components/partner/PartnerHowItWorks";

const PartnerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [partner, setPartner] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [networkPartners, setNetworkPartners] = useState<any[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<any[]>([]);
  const [topPartners, setTopPartners] = useState<any[]>([]);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [bankDetails, setBankDetails] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [partnerRes, regsRes, commsRes, payoutsRes] = await Promise.all([
        supabase.from("referral_partners").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("referral_registrations").select("*, organizations:organization_id(name, email)").order("registered_at", { ascending: false }),
        supabase.from("referral_commissions").select("*, organizations:organization_id(name)").order("created_at", { ascending: false }),
        supabase.from("referral_payouts").select("*").order("created_at", { ascending: false }),
      ]);

      if (partnerRes.data) {
        setPartner(partnerRes.data);
        setBankDetails(partnerRes.data.bank_details || "");

        // Load network (partners referred by this partner)
        const { data: netPartners } = await supabase
          .from("referral_partners")
          .select("id, code, status, total_earned, created_at, referred_by_partner_id")
          .eq("referred_by_partner_id", partnerRes.data.id);
        
        if (netPartners) {
          setNetworkPartners(netPartners);
          // Load level 2 partners
          const level2Ids = netPartners.map(p => p.id);
          if (level2Ids.length > 0) {
            const { data: l2Partners } = await supabase
              .from("referral_partners")
              .select("id, code, status, total_earned, created_at, referred_by_partner_id")
              .in("referred_by_partner_id", level2Ids);
            if (l2Partners) setNetworkPartners(prev => [...prev, ...l2Partners]);
          }
        }

        // Load monthly stats
        const { data: stats } = await supabase
          .from("partner_monthly_stats")
          .select("*")
          .eq("partner_id", partnerRes.data.id)
          .order("month", { ascending: false })
          .limit(6);
        if (stats) setMonthlyStats(stats);

        // Load top-10 for current month
        const now = new Date();
        const monthDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const { data: top } = await supabase
          .from("partner_monthly_stats")
          .select("rank, network_revenue, total_commission, partner_id")
          .eq("month", monthDate)
          .eq("is_top", true)
          .order("rank", { ascending: true })
          .limit(10);
        if (top) setTopPartners(top);
      }
      if (regsRes.data) setRegistrations(regsRes.data);
      if (commsRes.data) setCommissions(commsRes.data);
      if (payoutsRes.data) setPayouts(payoutsRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Ссылка скопирована!");
  };

  const handleSaveBankDetails = async () => {
    if (!partner) return;
    const { error } = await supabase.from("referral_partners").update({ bank_details: bankDetails }).eq("id", partner.id);
    if (error) toast.error("Ошибка сохранения");
    else toast.success("Реквизиты сохранены");
  };

  const handleRequestPayout = async () => {
    if (!partner) return;
    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount < 1000) { toast.error("Минимальная сумма вывода — 1 000 ₽"); return; }
    if (amount > Number(partner.balance)) { toast.error("Недостаточно средств"); return; }
    const { error } = await supabase.from("referral_payouts").insert({ partner_id: partner.id, amount });
    if (error) toast.error("Ошибка запроса", { description: getErrorMessage(error) });
    else { toast.success("Запрос на вывод отправлен"); setPayoutAmount(""); loadData(); }
  };

  if (!user) { navigate("/login"); return null; }
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  if (!partner) return <div className="min-h-screen flex flex-col items-center justify-center gap-4"><p className="text-muted-foreground">Вы ещё не являетесь партнёром.</p><Button onClick={() => navigate("/partner")}>Стать партнёром</Button></div>;

  const refLink = `${getBaseUrl()}/register?ref=${partner.code}`;
  const partnerRefLink = `${getBaseUrl()}/partner?partner_ref=${partner.code}`;
  const networkRevenue = Number(partner.monthly_network_revenue || 0);
  const turnoverProgress = Math.min((networkRevenue / 100000) * 100, 100);

  // Split commissions by level
  const l1Earned = commissions.filter(c => c.level === 1 && !c.bonus_type).reduce((s, c) => s + Number(c.commission_amount), 0);
  const l2Earned = commissions.filter(c => c.level === 2 && !c.bonus_type).reduce((s, c) => s + Number(c.commission_amount), 0);
  const l3Earned = commissions.filter(c => c.level === 3 && !c.bonus_type).reduce((s, c) => s + Number(c.commission_amount), 0);
  const bonusEarned = commissions.filter(c => c.bonus_type).reduce((s, c) => s + Number(c.commission_amount), 0);

  // Network counts
  const level1Partners = networkPartners.filter(p => p.referred_by_partner_id === partner.id);
  const level2PartnerIds = level1Partners.map(p => p.id);
  const level2Partners = networkPartners.filter(p => level2PartnerIds.includes(p.referred_by_partner_id));

  const levelLabel = (l: number) => l === 1 ? "Ур. 1" : l === 2 ? "Ур. 2" : "Ур. 3";
  const bonusLabel = (t: string | null) => t === "turnover" ? "Оборот" : t === "leader" ? "Лидер" : "—";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/partner")}><ArrowLeft className="w-5 h-5" /></Button>
            <SigmaLogo size="md" showText />
            <Badge variant="secondary">Партнёрский кабинет</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => navigate("/partner/offer")}>
              <FileText className="w-3.5 h-3.5" /> Оферта
            </Button>
            {partner.has_turnover_bonus && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30"><Award className="w-3 h-3 mr-1" />Бонус оборота</Badge>}
            {partner.is_top_partner && <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30"><Crown className="w-3 h-3 mr-1" />Топ-10</Badge>}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Users className="w-3.5 h-3.5" /> Клиентов</div>
              <div className="text-2xl font-bold">{registrations.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Network className="w-3.5 h-3.5" /> Сеть</div>
              <div className="text-2xl font-bold">{networkPartners.length}</div>
              <div className="text-xs text-muted-foreground">Ур.1: {level1Partners.length} • Ур.2: {level2Partners.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="w-3.5 h-3.5" /> Ставки</div>
              <div className="text-lg font-bold">{partner.level1_percent}% / {partner.level2_percent}% / {partner.level3_percent}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><DollarSign className="w-3.5 h-3.5" /> Заработано</div>
              <div className="text-2xl font-bold">{Number(partner.total_earned).toLocaleString("ru-RU")} ₽</div>
              <div className="text-xs text-muted-foreground mt-1">
                Ур.1: {l1Earned.toLocaleString("ru-RU")} • Ур.2: {l2Earned.toLocaleString("ru-RU")} • Ур.3: {l3Earned.toLocaleString("ru-RU")}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Wallet className="w-3.5 h-3.5" /> Баланс</div>
              <div className="text-2xl font-bold text-primary">{Number(partner.balance).toLocaleString("ru-RU")} ₽</div>
            </CardContent>
          </Card>
        </div>

        {/* Turnover bonus progress */}
        <Card className="mb-8">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Award className="w-4 h-4 text-emerald-500" />
                Прогресс до бонуса за оборот (+5%)
              </div>
              <span className="text-sm text-muted-foreground">
                {networkRevenue.toLocaleString("ru-RU")} / 100 000 ₽
              </span>
            </div>
            <Progress value={turnoverProgress} className="h-3" />
            {partner.has_turnover_bonus && (
              <p className="text-xs text-emerald-600 mt-2 font-medium">✓ Бонус за оборот активен! Вы получаете дополнительно +5% от каждого платежа.</p>
            )}
          </CardContent>
        </Card>

        {/* Referral links */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Ссылка для организаций</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input value={refLink} readOnly className="font-mono text-xs" />
                <Button onClick={() => handleCopyLink(refLink)} variant="outline" size="sm"><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Ссылка для привлечения партнёров</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input value={partnerRefLink} readOnly className="font-mono text-xs" />
                <Button onClick={() => handleCopyLink(partnerRefLink)} variant="outline" size="sm"><Copy className="w-3.5 h-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="registrations">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="registrations">Клиенты ({registrations.length})</TabsTrigger>
            <TabsTrigger value="commissions">Начисления ({commissions.length})</TabsTrigger>
            <TabsTrigger value="network">Моя сеть ({networkPartners.length})</TabsTrigger>
            <TabsTrigger value="materials">Материалы</TabsTrigger>
            <TabsTrigger value="how">Как это работает</TabsTrigger>
            <TabsTrigger value="leaderboard">Рейтинг</TabsTrigger>
            <TabsTrigger value="payouts">Выплаты</TabsTrigger>
            <TabsTrigger value="withdraw">Вывод средств</TabsTrigger>
          </TabsList>

          <TabsContent value="registrations">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Организация</TableHead>
                      <TableHead>Дата регистрации</TableHead>
                      <TableHead>Действует до</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {registrations.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Пока нет привлечённых клиентов</TableCell></TableRow>
                    ) : registrations.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{(r.organizations as any)?.name || "—"}</TableCell>
                        <TableCell>{new Date(r.registered_at).toLocaleDateString("ru-RU")}</TableCell>
                        <TableCell>{new Date(r.expires_at).toLocaleDateString("ru-RU")}</TableCell>
                      </TableRow>
                    ))}
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
                      <TableHead>Организация</TableHead>
                      <TableHead>Уровень</TableHead>
                      <TableHead>Сумма платежа</TableHead>
                      <TableHead>Комиссия</TableHead>
                      <TableHead>Бонус</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Дата</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissions.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Начислений пока нет</TableCell></TableRow>
                    ) : commissions.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{(c.organizations as any)?.name || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{levelLabel(c.level)}</Badge></TableCell>
                        <TableCell>{Number(c.amount).toLocaleString("ru-RU")} ₽</TableCell>
                        <TableCell className="font-medium text-primary">{Number(c.commission_amount).toLocaleString("ru-RU")} ₽</TableCell>
                        <TableCell>
                          {c.bonus_type ? (
                            <Badge className={c.bonus_type === "turnover" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-amber-500/15 text-amber-600 border-amber-500/30"}>
                              {bonusLabel(c.bonus_type)}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.status === "paid" ? "default" : "secondary"}>
                            {c.status === "paid" ? "Выплачено" : c.status === "pending" ? "Ожидает" : c.status}
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

          <TabsContent value="network">
            <PartnerNetworkTree
              partnerId={partner.id}
              partnerCode={partner.code}
              networkPartners={networkPartners}
              registrations={registrations}
            />
          </TabsContent>

          <TabsContent value="materials">
            <PartnerMaterials refLink={refLink} partnerRefLink={partnerRefLink} partnerCode={partner.code} />
          </TabsContent>

          <TabsContent value="how">
            <PartnerHowItWorks />
          </TabsContent>

          <TabsContent value="leaderboard">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-500" /> Топ-10 партнёров месяца
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {topPartners.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">Рейтинг обновляется в начале каждого месяца</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Место</TableHead>
                        <TableHead>Оборот сети</TableHead>
                        <TableHead>Комиссия</TableHead>
                        <TableHead>Это вы?</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topPartners.map((t) => {
                        const isMe = t.partner_id === partner.id;
                        return (
                          <TableRow key={t.partner_id} className={isMe ? "bg-teal-500/5" : ""}>
                            <TableCell>
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${t.rank <= 3 ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                                {t.rank}
                              </div>
                            </TableCell>
                            <TableCell>{Number(t.network_revenue).toLocaleString("ru-RU")} ₽</TableCell>
                            <TableCell>{Number(t.total_commission).toLocaleString("ru-RU")} ₽</TableCell>
                            <TableCell>{isMe ? <Badge className="bg-teal-500/15 text-teal-600 border-teal-500/30">Вы</Badge> : "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Monthly stats history */}
            {monthlyStats.length > 0 && (
              <Card className="mt-6">
                <CardHeader><CardTitle className="text-base">Ваша статистика по месяцам</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Месяц</TableHead>
                        <TableHead>Оборот сети</TableHead>
                        <TableHead>Прямой доход</TableHead>
                        <TableHead>Всего комиссия</TableHead>
                        <TableHead>Место</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyStats.map(s => (
                        <TableRow key={s.id}>
                          <TableCell>{new Date(s.month).toLocaleDateString("ru-RU", { month: "long", year: "numeric" })}</TableCell>
                          <TableCell>{Number(s.network_revenue).toLocaleString("ru-RU")} ₽</TableCell>
                          <TableCell>{Number(s.direct_revenue).toLocaleString("ru-RU")} ₽</TableCell>
                          <TableCell className="font-medium">{Number(s.total_commission).toLocaleString("ru-RU")} ₽</TableCell>
                          <TableCell>
                            {s.is_top ? (
                              <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30">#{s.rank}</Badge>
                            ) : (s.rank ? `#${s.rank}` : "—")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="payouts">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Сумма</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Запрошено</TableHead>
                      <TableHead>Выплачено</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Выплат пока нет</TableCell></TableRow>
                    ) : payouts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{Number(p.amount).toLocaleString("ru-RU")} ₽</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "paid" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>
                            {p.status === "paid" ? "Выплачено" : p.status === "pending" ? "Ожидает" : p.status === "rejected" ? "Отклонено" : p.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(p.created_at).toLocaleDateString("ru-RU")}</TableCell>
                        <TableCell>{p.paid_at ? new Date(p.paid_at).toLocaleDateString("ru-RU") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdraw">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle className="text-lg">Банковские реквизиты</CardTitle></CardHeader>
                <CardContent>
                  <Textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} placeholder="ФИО, банк, номер счёта, БИК, ИНН..." rows={5} className="mb-4" />
                  <Button onClick={handleSaveBankDetails}>Сохранить реквизиты</Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-lg">Запрос на вывод</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Доступно: <strong>{Number(partner.balance).toLocaleString("ru-RU")} ₽</strong>. Минимальная сумма — 1 000 ₽.
                  </p>
                  <Input type="number" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} placeholder="Сумма вывода" className="mb-4" />
                  <Button onClick={handleRequestPayout} disabled={!bankDetails}>Запросить вывод</Button>
                  {!bankDetails && <p className="text-xs text-destructive mt-2">Сначала заполните реквизиты.</p>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default PartnerDashboard;
