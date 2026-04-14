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
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Copy, TrendingUp, Users, DollarSign, Wallet, ArrowLeft, Download, ExternalLink } from "lucide-react";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { toast } from "sonner";

const PartnerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [partner, setPartner] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [promoMaterials, setPromoMaterials] = useState<any[]>([]);
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
      toast.error("Ошибка запроса", { description: "error.message" });
    } else {
      toast.success("Запрос на вывод отправлен");
      setPayoutAmount("");
      loadData();
    }
  };

  if (!user) {
    navigate("/login");
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Вы ещё не являетесь партнёром.</p>
        <Button onClick={() => navigate("/partner")}>Стать партнёром</Button>
      </div>
    );
  }

  const refLink = `${getBaseUrl()}/register?ref=${partner.code}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/partner")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <SigmaLogo size="md" showText />
            <Badge variant="secondary">Партнёрский кабинет</Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Users className="w-4 h-4" /> Клиентов
              </div>
              <div className="text-2xl font-bold">{registrations.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <TrendingUp className="w-4 h-4" /> Комиссия
              </div>
              <div className="text-2xl font-bold">{partner.commission_percent}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <DollarSign className="w-4 h-4" /> Заработано
              </div>
              <div className="text-2xl font-bold">{Number(partner.total_earned).toLocaleString("ru-RU")} ₽</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                <Wallet className="w-4 h-4" /> Баланс
              </div>
              <div className="text-2xl font-bold text-primary">{Number(partner.balance).toLocaleString("ru-RU")} ₽</div>
            </CardContent>
          </Card>
        </div>

        {/* Referral link */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Ваша реферальная ссылка</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input value={refLink} readOnly className="font-mono text-sm" />
              <Button onClick={handleCopyLink} variant="outline">
                <Copy className="w-4 h-4 mr-2" /> Копировать
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Cookie сохраняется на 90 дней после перехода по ссылке.</p>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="registrations">
          <TabsList className="mb-6">
            <TabsTrigger value="registrations">Клиенты ({registrations.length})</TabsTrigger>
            <TabsTrigger value="commissions">Начисления ({commissions.length})</TabsTrigger>
            <TabsTrigger value="payouts">Выплаты ({payouts.length})</TabsTrigger>
            <TabsTrigger value="materials">Материалы</TabsTrigger>
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
                        <TableCell className="font-medium text-primary">{Number(c.commission_amount).toLocaleString("ru-RU")} ₽</TableCell>
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

          <TabsContent value="materials">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Social media / messenger texts */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Тексты для мессенджеров и соцсетей</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {[
                    `🎓 Рекомендую платформу СИНТАГМА для дистанционного обучения! Документооборот, тесты, видеоидентификация — всё в одном месте.\n\nРегистрация: ${refLink}`,
                    `🚀 Ищете систему для обучения сотрудников? СИНТАГМА — современная LMS с ФРДО, онлайн-кассой и ИИ-генерацией курсов.\n\nПопробуйте бесплатно: ${refLink}`,
                    `💡 Автоматизируйте обучение с СИНТАГМА! Курсы, тесты, документы, охрана труда — единая платформа для учебных центров.\n\nПодробнее: ${refLink}`,
                    `📚 Как учебному центру сэкономить 80% времени на документообороте? Перейти на СИНТАГМА — платформу с ИИ, ФРДО и электронной подписью.\n\nУзнать больше: ${refLink}`,
                    `🏆 Уже 100+ организаций используют СИНТАГМА для дистанционного обучения. Присоединяйтесь!\n\n👉 ${refLink}`,
                  ].map((text, i) => (
                    <div key={i} className="bg-muted rounded-lg p-4">
                      <pre className="text-sm whitespace-pre-wrap mb-3 font-sans">{text}</pre>
                      <Button size="sm" variant="outline" onClick={() => {
                        navigator.clipboard.writeText(text);
                        toast.success("Текст скопирован!");
                      }}>
                        <Copy className="w-3 h-3 mr-1" /> Копировать
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Email templates */}
              <Card>
                <CardHeader><CardTitle className="text-lg">Тексты для email-рассылки</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {[
                    `Тема: Платформа для дистанционного обучения — бесплатный старт\n\nЗдравствуйте!\n\nХочу рассказать вам о платформе СИНТАГМА — это современная система дистанционного обучения для учебных центров и организаций.\n\nЧто входит:\n• Создание курсов с ИИ-помощником\n• Тесты и видеоидентификация\n• Интеграция с ФРДО\n• Электронный документооборот\n• Охрана труда\n\nНачать можно бесплатно: ${refLink}\n\nС уважением`,
                    `Тема: Сэкономьте 80% времени на обучении сотрудников\n\nДобрый день!\n\nЕсли ваша организация проводит обучение — обратите внимание на СИНТАГМА. Платформа автоматизирует:\n\n✅ Создание и назначение курсов\n✅ Тестирование и аттестацию\n✅ Выдачу документов об образовании\n✅ Выгрузку в ФРДО\n\nПопробуйте бесплатно: ${refLink}`,
                    `Тема: Новая LMS-платформа с ИИ — СИНТАГМА\n\nПриветствую!\n\nСИНТАГМА — платформа нового поколения для учебных центров:\n\n🤖 ИИ генерирует курсы за минуты\n📄 Автоматический документооборот\n🎥 Видеоидентификация учеников\n📊 Аналитика и журналы\n\nРегистрация бесплатна: ${refLink}`,
                  ].map((text, i) => (
                    <div key={i} className="bg-muted rounded-lg p-4">
                      <pre className="text-sm whitespace-pre-wrap mb-3 font-sans">{text}</pre>
                      <Button size="sm" variant="outline" onClick={() => {
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
              <Card>
                <CardHeader><CardTitle className="text-lg">Банковские реквизиты</CardTitle></CardHeader>
                <CardContent>
                  <Textarea
                    value={bankDetails}
                    onChange={(e) => setBankDetails(e.target.value)}
                    placeholder="ФИО, банк, номер счёта, БИК, ИНН..."
                    rows={5}
                    className="mb-4"
                  />
                  <Button onClick={handleSaveBankDetails}>Сохранить реквизиты</Button>
                </CardContent>
              </Card>
              <Card>
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
                    className="mb-4"
                  />
                  <Button onClick={handleRequestPayout} disabled={!bankDetails}>
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
      </main>
    </div>
  );
};

export default PartnerDashboard;
