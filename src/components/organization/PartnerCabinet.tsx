import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Copy, TrendingUp, Users, DollarSign, Wallet, Sparkles, Link as LinkIcon } from "lucide-react";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export function PartnerCabinet() {
  const { user } = useAuth();
  const [partner, setPartner] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [promoMaterials, setPromoMaterials] = useState<any[]>([]);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [bankDetails, setBankDetails] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBecoming, setIsBecoming] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [partnerRes, regsRes, commsRes, payoutsRes, materialsRes] = await Promise.all([
        supabase.from("referral_partners").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("referral_registrations").select("*, organizations:organization_id(name, email)").order("registered_at", { ascending: false }),
        supabase.from("referral_commissions").select("*, organizations:organization_id(name)").order("created_at", { ascending: false }),
        supabase.from("referral_payouts").select("*").order("created_at", { ascending: false }),
        supabase.from("referral_promo_materials").select("*").eq("is_active", true),
      ]);
      if (partnerRes.data) {
        setPartner(partnerRes.data);
        setBankDetails(partnerRes.data.bank_details || "");
      }
      if (regsRes.data) setRegistrations(regsRes.data);
      if (commsRes.data) setCommissions(commsRes.data);
      if (payoutsRes.data) setPayouts(payoutsRes.data);
      if (materialsRes.data) setPromoMaterials(materialsRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBecomePartner = async () => {
    if (!user) return;
    setIsBecoming(true);
    try {
      const { data, error } = await supabase.rpc("become_referral_partner");
      if (error) throw error;
      toast.success("Вы стали партнёром!", { description: `Ваш реферальный код: ${data}` });
      loadData();
    } catch (e: any) {
      toast.error("Ошибка", { description: e.message });
    } finally {
      setIsBecoming(false);
    }
  };

  const handleCopyLink = () => {
    if (!partner) return;
    navigator.clipboard.writeText(`${getBaseUrl()}/register?ref=${partner.code}`);
    toast.success("Ссылка скопирована!");
  };

  const handleSaveBankDetails = async () => {
    if (!partner) return;
    const { error } = await supabase
      .from("referral_partners")
      .update({ bank_details: bankDetails })
      .eq("id", partner.id);
    if (error) {
      toast.error("Ошибка сохранения");
    } else {
      toast.success("Реквизиты сохранены");
    }
  };

  const handleRequestPayout = async () => {
    if (!partner) return;
    const amount = parseFloat(payoutAmount);
    if (isNaN(amount) || amount < 1000) {
      toast.error("Минимальная сумма вывода — 1 000 ₽");
      return;
    }
    if (amount > Number(partner.balance)) {
      toast.error("Недостаточно средств");
      return;
    }
    const { error } = await supabase.from("referral_payouts").insert({
      partner_id: partner.id,
      amount,
    });
    if (error) {
      toast.error("Ошибка запроса", { description: error.message });
    } else {
      toast.success("Запрос на вывод отправлен");
      setPayoutAmount("");
      loadData();
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  // Not a partner yet — show join form
  if (!partner) {
    return (
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">Партнёрская программа</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-muted-foreground">
              Рекомендуйте нашу платформу и получайте до <strong className="text-foreground">25%</strong> от оплат 
              привлечённых организаций в течение <strong className="text-foreground">2 лет</strong>.
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>Комиссия от 10% до 25% в зависимости от количества привлечённых клиентов</li>
              <li>Реферальная ссылка с cookie на 90 дней</li>
              <li>Готовые промо-материалы и тексты</li>
              <li>Вывод средств от 1 000 ₽</li>
            </ul>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="partner-agree"
              checked={agreedToTerms}
              onCheckedChange={(v) => setAgreedToTerms(v === true)}
            />
            <label htmlFor="partner-agree" className="text-sm text-muted-foreground cursor-pointer">
              Я согласен с{" "}
              <Link to="/partner/offer" className="text-accent underline underline-offset-2 hover:text-accent/80">
                условиями партнёрской программы
              </Link>
            </label>
          </div>
          <Button 
            className="btn-gradient rounded-xl gap-2" 
            onClick={handleBecomePartner} 
            disabled={isBecoming || !agreedToTerms}
          >
            <Sparkles className="w-4 h-4" /> Стать партнёром
          </Button>
        </CardContent>
      </Card>
    );
  }

  const refLink = `${getBaseUrl()}/register?ref=${partner.code}`;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Users className="w-4 h-4" /> Клиентов
            </div>
            <div className="text-2xl font-bold">{registrations.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <TrendingUp className="w-4 h-4" /> Комиссия
            </div>
            <div className="text-2xl font-bold">{partner.commission_percent}%</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <DollarSign className="w-4 h-4" /> Заработано
            </div>
            <div className="text-2xl font-bold">{Number(partner.total_earned).toLocaleString("ru-RU")} ₽</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Wallet className="w-4 h-4" /> Баланс
            </div>
            <div className="text-2xl font-bold" style={{ color: "hsl(var(--accent))" }}>{Number(partner.balance).toLocaleString("ru-RU")} ₽</div>
          </CardContent>
        </Card>
      </div>

      {/* Referral link */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><LinkIcon className="w-5 h-5" /> Ваша реферальная ссылка</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input value={refLink} readOnly className="font-mono text-sm rounded-xl" />
            <Button onClick={handleCopyLink} variant="outline" className="rounded-xl">
              <Copy className="w-4 h-4 mr-2" /> Копировать
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Cookie сохраняется на 90 дней после перехода по ссылке.</p>
        </CardContent>
      </Card>

      {/* Detail tabs */}
      <Tabs defaultValue="registrations">
        <TabsList className="mb-4 rounded-xl">
          <TabsTrigger value="registrations" className="rounded-lg">Клиенты ({registrations.length})</TabsTrigger>
          <TabsTrigger value="commissions" className="rounded-lg">Начисления ({commissions.length})</TabsTrigger>
          <TabsTrigger value="payouts" className="rounded-lg">Выплаты ({payouts.length})</TabsTrigger>
          <TabsTrigger value="materials" className="rounded-lg">Материалы</TabsTrigger>
          <TabsTrigger value="withdraw" className="rounded-lg">Вывод средств</TabsTrigger>
        </TabsList>

        <TabsContent value="registrations">
          <Card className="rounded-2xl">
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
          <Card className="rounded-2xl">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Организация</TableHead>
                    <TableHead>Сумма платежа</TableHead>
                    <TableHead>Комиссия</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Дата</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Начислений пока нет</TableCell></TableRow>
                  ) : commissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{(c.organizations as any)?.name || "—"}</TableCell>
                      <TableCell>{Number(c.amount).toLocaleString("ru-RU")} ₽</TableCell>
                      <TableCell className="font-medium" style={{ color: "hsl(var(--accent))" }}>{Number(c.commission_amount).toLocaleString("ru-RU")} ₽</TableCell>
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

        <TabsContent value="payouts">
          <Card className="rounded-2xl">
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

        <TabsContent value="materials">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-lg">Тексты для мессенджеров</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  `🎓 Рекомендую платформу СИНТАГМА для дистанционного обучения! Документооборот, тесты, видеоидентификация — всё в одном месте.\n\nРегистрация: ${refLink}`,
                  `🚀 Ищете систему для обучения сотрудников? СИНТАГМА — современная LMS с ФРДО, онлайн-кассой и ИИ-генерацией курсов.\n\nПопробуйте бесплатно: ${refLink}`,
                ].map((text, i) => (
                  <div key={i} className="bg-muted rounded-xl p-4">
                    <pre className="text-sm whitespace-pre-wrap mb-3 font-sans">{text}</pre>
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={() => {
                      navigator.clipboard.writeText(text);
                      toast.success("Текст скопирован!");
                    }}>
                      <Copy className="w-3 h-3 mr-1" /> Копировать
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-lg">Тексты для email</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  `Тема: Платформа для дистанционного обучения — бесплатный старт\n\nЗдравствуйте!\n\nХочу рассказать вам о платформе СИНТАГМА — это современная система дистанционного обучения.\n\nНачать можно бесплатно: ${refLink}\n\nС уважением`,
                  `Тема: Сэкономьте 80% времени на обучении сотрудников\n\nДобрый день!\n\nОбратите внимание на СИНТАГМА — автоматизация курсов, тестирования, документооборота и ФРДО.\n\nПопробуйте: ${refLink}`,
                ].map((text, i) => (
                  <div key={i} className="bg-muted rounded-xl p-4">
                    <pre className="text-sm whitespace-pre-wrap mb-3 font-sans">{text}</pre>
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={() => {
                      navigator.clipboard.writeText(text);
                      toast.success("Текст скопирован!");
                    }}>
                      <Copy className="w-3 h-3 mr-1" /> Копировать
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="withdraw">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-lg">Банковские реквизиты</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={bankDetails}
                  onChange={(e) => setBankDetails(e.target.value)}
                  placeholder="ФИО, банк, номер счёта, БИК, ИНН..."
                  rows={5}
                  className="mb-4 rounded-xl"
                />
                <Button onClick={handleSaveBankDetails} className="rounded-xl">Сохранить реквизиты</Button>
              </CardContent>
            </Card>
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-lg">Запрос на вывод</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Доступно: <strong>{Number(partner.balance).toLocaleString("ru-RU")} ₽</strong>. Минимальная сумма — 1 000 ₽.
                </p>
                <Input
                  type="number"
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(e.target.value)}
                  placeholder="Сумма вывода"
                  className="mb-4 rounded-xl"
                />
                <Button onClick={handleRequestPayout} disabled={!bankDetails} className="rounded-xl">
                  Запросить вывод
                </Button>
                {!bankDetails && (
                  <p className="text-xs text-destructive mt-2">Сначала заполните реквизиты.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
