import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowRight, Gift, TrendingUp, Users, Clock, DollarSign, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/landing/Footer";
import { Helmet } from "react-helmet-async";

const PartnerLanding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isPartner, setIsPartner] = useState(false);
  const [partnerCode, setPartnerCode] = useState<string | null>(null);
  const [isBecoming, setIsBecoming] = useState(false);

  useEffect(() => {
    if (user) {
      supabase
        .from("referral_partners")
        .select("code")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setIsPartner(true);
            setPartnerCode(data.code);
          }
        });
    }
  }, [user]);

  const handleBecomePartner = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    setIsBecoming(true);
    try {
      const { data, error } = await supabase.rpc("become_referral_partner");
      if (error) throw error;
      setPartnerCode(data);
      setIsPartner(true);
      toast({ title: "Вы стали партнёром!", description: `Ваш реферальный код: ${data}` });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    } finally {
      setIsBecoming(false);
    }
  };

  const steps = [
    { icon: Users, title: "Зарегистрируйтесь", desc: "Станьте партнёром за 1 клик" },
    { icon: ExternalLink, title: "Делитесь ссылкой", desc: "Отправьте реферальную ссылку вашим контактам" },
    { icon: DollarSign, title: "Получайте доход", desc: "10–25% от оплат привлечённых организаций" },
  ];

  const benefits = [
    { icon: TrendingUp, title: "До 25% комиссии", desc: "Начните с 10% и растите по мере привлечения клиентов" },
    { icon: Clock, title: "2 года выплат", desc: "Получайте комиссию в течение 2 лет после регистрации клиента" },
    { icon: Gift, title: "Рекламные материалы", desc: "Готовые баннеры, тексты и UTM-ссылки для продвижения" },
    { icon: CheckCircle2, title: "Прозрачная статистика", desc: "Отслеживайте переходы, регистрации и начисления в кабинете" },
  ];

  return (
    <>
      <Helmet>
        <title>Партнёрская программа — СИНТАГМА</title>
        <meta name="description" content="Зарабатывайте до 25% от оплат привлечённых организаций. Присоединяйтесь к партнёрской программе СИНТАГМА." />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="container mx-auto px-6 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <SigmaLogo size="md" showText />
            </Link>
            <div className="flex items-center gap-3">
              {isPartner ? (
                <Button onClick={() => navigate("/partner/dashboard")}>Кабинет партнёра</Button>
              ) : (
                <Button onClick={handleBecomePartner} disabled={isBecoming}>
                  {isBecoming ? "Загрузка..." : "Стать партнёром"}
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="py-20 lg:py-32 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
          <div className="container mx-auto px-6 relative">
            <div className="max-w-3xl mx-auto text-center">
              <Badge variant="secondary" className="mb-6">Партнёрская программа</Badge>
              <h1 className="font-display text-4xl lg:text-6xl font-bold mb-6 tracking-tight">
                Зарабатывайте вместе с <span className="text-primary">СИНТАГМА</span>
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Рекомендуйте нашу платформу и получайте до 25% от оплат привлечённых организаций в течение 2 лет.
              </p>
              {isPartner && partnerCode ? (
                <div className="flex flex-col items-center gap-4">
                  <p className="text-sm text-muted-foreground">Ваша реферальная ссылка:</p>
                  <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-3">
                    <code className="text-sm font-mono">{`${window.location.origin}/register?ref=${partnerCode}`}</code>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/register?ref=${partnerCode}`);
                        toast({ title: "Ссылка скопирована!" });
                      }}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button onClick={() => navigate("/partner/dashboard")} className="mt-2">
                    Перейти в кабинет <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              ) : (
                <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming} className="text-lg px-8 py-6">
                  Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-6">
            <h2 className="font-display text-3xl font-bold text-center mb-12">Как это работает</h2>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                >
                  <Card className="text-center h-full">
                    <CardContent className="pt-8 pb-6">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <step.icon className="w-8 h-8 text-primary" />
                      </div>
                      <div className="text-sm font-bold text-primary mb-2">Шаг {i + 1}</div>
                      <h3 className="font-display text-lg font-semibold mb-2">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-20">
          <div className="container mx-auto px-6">
            <h2 className="font-display text-3xl font-bold text-center mb-12">Преимущества программы</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {benefits.map((b, i) => (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card className="h-full">
                    <CardContent className="pt-6">
                      <b.icon className="w-8 h-8 text-primary mb-4" />
                      <h3 className="font-semibold mb-2">{b.title}</h3>
                      <p className="text-sm text-muted-foreground">{b.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Commission table */}
        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-6">
            <h2 className="font-display text-3xl font-bold text-center mb-12">Уровни комиссии</h2>
            <div className="max-w-2xl mx-auto">
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {[
                      { level: "Стартовый", clients: "0–5", percent: "10%" },
                      { level: "Базовый", clients: "6–15", percent: "15%" },
                      { level: "Продвинутый", clients: "16–30", percent: "20%" },
                      { level: "Эксперт", clients: "31+", percent: "25%" },
                    ].map((row) => (
                      <div key={row.level} className="flex items-center justify-between px-6 py-4">
                        <div>
                          <div className="font-semibold">{row.level}</div>
                          <div className="text-sm text-muted-foreground">{row.clients} клиентов</div>
                        </div>
                        <Badge variant="secondary" className="text-lg font-bold px-4 py-1">{row.percent}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20">
          <div className="container mx-auto px-6 text-center">
            <h2 className="font-display text-3xl font-bold mb-4">Начните зарабатывать уже сегодня</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Регистрация занимает 1 минуту. Получите реферальную ссылку и начните привлекать клиентов.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isPartner ? (
                <Button size="lg" onClick={() => navigate("/partner/dashboard")}>
                  Кабинет партнёра <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              ) : (
                <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming}>
                  Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              )}
              <Button size="lg" variant="outline" asChild>
                <Link to="/partner/offer">Условия программы</Link>
              </Button>
            </div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default PartnerLanding;
