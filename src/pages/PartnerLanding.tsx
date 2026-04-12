import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowRight, Gift, TrendingUp, Users, Clock, DollarSign, CheckCircle2, Copy, ExternalLink, Zap, Shield, BarChart3, MessageCircle, Mail, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Footer } from "@/components/landing/Footer";
import { Helmet } from "react-helmet-async";
import { getBaseUrl } from "@/utils/getBaseUrl";

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
          if (data) { setIsPartner(true); setPartnerCode(data.code); }
        });
    }
  }, [user]);

  const handleBecomePartner = async () => {
    if (!user) { navigate("/login"); return; }
    setIsBecoming(true);
    try {
      const { data, error } = await supabase.rpc("become_referral_partner");
      if (error) throw error;
      setPartnerCode(data);
      setIsPartner(true);
      toast({ title: "Вы стали партнёром!", description: `Ваш реферальный код: ${data}` });
    } catch (e: any) {
      toast({ title: "Ошибка", description: e.message, variant: "destructive" });
    } finally { setIsBecoming(false); }
  };

  // Per-character animation for СИНТАГМА
  const brandName = "СИНТАГМА";
  const charVariants = {
    hidden: { opacity: 0, y: 30, rotateX: -90 },
    visible: (i: number) => ({
      opacity: 1, y: 0, rotateX: 0,
      transition: { delay: 0.8 + i * 0.08, type: "spring" as const, damping: 12, stiffness: 200 }
    }),
  };

  const steps = [
    { icon: Users, title: "Зарегистрируйтесь", desc: "Станьте партнёром за 1 клик — нужен только аккаунт на платформе" },
    { icon: ExternalLink, title: "Делитесь ссылкой", desc: "Отправьте персональную ссылку вашим контактам и аудитории" },
    { icon: DollarSign, title: "Получайте доход", desc: "10–25% от каждого платежа привлечённых организаций" },
  ];

  const benefits = [
    { icon: TrendingUp, title: "До 25% комиссии", desc: "Растущая ставка: чем больше клиентов, тем выше ваш процент" },
    { icon: Clock, title: "2 года выплат", desc: "Получайте комиссию в течение 24 месяцев после регистрации клиента" },
    { icon: Shield, title: "Прозрачная статистика", desc: "Кабинет партнёра с аналитикой переходов, регистраций и начислений" },
    { icon: Zap, title: "Быстрый старт", desc: "Готовые тексты для рассылки, без вложений и обязательств" },
  ];

  const commissionTiers = [
    { level: "Стартовый", clients: "0–5", percent: "10%", color: "from-primary/10 to-primary/5" },
    { level: "Базовый", clients: "6–15", percent: "15%", color: "from-primary/20 to-primary/10" },
    { level: "Продвинутый", clients: "16–30", percent: "20%", color: "from-primary/30 to-primary/15" },
    { level: "Эксперт", clients: "31+", percent: "25%", color: "from-primary/40 to-primary/20" },
  ];

  return (
    <>
      <Helmet>
        <title>Партнёрская программа — СИНТАГМА</title>
        <meta name="description" content="Зарабатывайте до 25% от оплат привлечённых организаций. Партнёрская программа СИНТАГМА." />
      </Helmet>

      <div className="min-h-screen bg-background overflow-hidden">
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

        {/* Hero — animated with decorative elements */}
        <section className="py-24 lg:py-36 relative overflow-hidden">
          {/* Background gradients */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/4" />
          <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />

          {/* Floating decorative elements */}
          <motion.div
            className="absolute top-32 right-[15%] w-20 h-20 border-2 border-primary/15 rounded-2xl"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute bottom-24 left-[10%] w-12 h-12 bg-primary/10 rounded-full"
            animate={{ y: [-10, 10, -10] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/2 right-[8%] w-3 h-3 bg-primary/30 rounded-full"
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
          />

          <div className="container mx-auto px-6 relative">
            <div className="max-w-3xl mx-auto text-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm">
                  <Gift className="w-4 h-4 mr-1.5" /> Партнёрская программа
                </Badge>
              </motion.div>

              <motion.h1
                className="font-display text-4xl lg:text-6xl font-bold mb-6 tracking-tight"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.7 }}
              >
                Зарабатывайте вместе с{" "}
                <span className="inline-flex text-primary">
                  {brandName.split("").map((char, i) => (
                    <motion.span
                      key={i}
                      custom={i}
                      variants={charVariants}
                      initial="hidden"
                      animate="visible"
                      className="inline-block"
                    >
                      {char}
                    </motion.span>
                  ))}
                </span>
              </motion.h1>

              <motion.p
                className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 0.8 }}
              >
                Рекомендуйте нашу платформу и получайте до <strong className="text-foreground">25%</strong> от оплат 
                привлечённых организаций в течение <strong className="text-foreground">2 лет</strong>.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.8, duration: 0.6 }}
              >
                {isPartner && partnerCode ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-sm text-muted-foreground">Ваша реферальная ссылка:</p>
                    <div className="flex items-center gap-2 bg-muted rounded-xl px-5 py-3 border border-border">
                      <code className="text-sm font-mono">{`${getBaseUrl()}/register?ref=${partnerCode}`}</code>
                      <Button size="icon" variant="ghost" onClick={() => {
                        navigator.clipboard.writeText(`${getBaseUrl()}/register?ref=${partnerCode}`);
                        toast({ title: "Ссылка скопирована!" });
                      }}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button onClick={() => navigate("/partner/dashboard")} size="lg" className="mt-2">
                      Перейти в кабинет <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming}
                    className="text-lg px-10 py-7 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow">
                    Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                )}
              </motion.div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-24 bg-muted/30 relative">
          <div className="container mx-auto px-6">
            <motion.h2
              className="font-display text-3xl lg:text-4xl font-bold text-center mb-4"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Как это работает
            </motion.h2>
            <motion.p
              className="text-muted-foreground text-center mb-14 max-w-lg mx-auto"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              Три простых шага до стабильного пассивного дохода
            </motion.p>
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              {steps.map((step, i) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15, type: "spring", damping: 20 }}
                >
                  <Card className="text-center h-full border-0 shadow-md hover:shadow-lg transition-shadow bg-card">
                    <CardContent className="pt-8 pb-6">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mx-auto mb-5 relative">
                        <step.icon className="w-7 h-7 text-primary" />
                        <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                          {i + 1}
                        </div>
                      </div>
                      <h3 className="font-display text-lg font-semibold mb-2">{step.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits */}
        <section className="py-24">
          <div className="container mx-auto px-6">
            <motion.h2
              className="font-display text-3xl lg:text-4xl font-bold text-center mb-14"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              Преимущества программы
            </motion.h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {benefits.map((b, i) => (
                <motion.div
                  key={b.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ y: -4 }}
                >
                  <Card className="h-full border-0 shadow-md hover:shadow-lg transition-all">
                    <CardContent className="pt-6">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center mb-4">
                        <b.icon className="w-6 h-6 text-primary" />
                      </div>
                      <h3 className="font-semibold mb-2">{b.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Commission table */}
        <section className="py-24 bg-muted/30 relative">
          <div className="container mx-auto px-6">
            <motion.h2
              className="font-display text-3xl lg:text-4xl font-bold text-center mb-4"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              Уровни комиссии
            </motion.h2>
            <motion.p
              className="text-muted-foreground text-center mb-14 max-w-lg mx-auto"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              Ваша ставка растёт вместе с количеством привлечённых клиентов
            </motion.p>
            <div className="max-w-2xl mx-auto space-y-3">
              {commissionTiers.map((row, i) => (
                <motion.div
                  key={row.level}
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div className={`flex items-center justify-between px-6 py-5 rounded-xl bg-gradient-to-r ${row.color} border border-primary/10`}>
                    <div>
                      <div className="font-semibold">{row.level}</div>
                      <div className="text-sm text-muted-foreground">{row.clients} клиентов</div>
                    </div>
                    <div className="text-3xl font-bold text-primary">{row.percent}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5" />
          {/* Decorative corners */}
          <div className="absolute top-8 left-8 w-24 h-24 border-t-2 border-l-2 border-primary/20 rounded-tl-3xl" />
          <div className="absolute bottom-8 right-8 w-24 h-24 border-b-2 border-r-2 border-primary/20 rounded-br-3xl" />
          
          <motion.div
            className="absolute top-1/2 left-[5%] w-2 h-2 bg-primary/30 rounded-full"
            animate={{ y: [-8, 8, -8], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
          />

          <div className="container mx-auto px-6 text-center relative">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
              <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4">Начните зарабатывать уже сегодня</h2>
              <p className="text-muted-foreground mb-10 max-w-lg mx-auto text-lg">
                Регистрация занимает 1 минуту. Получите персональную ссылку и начните привлекать клиентов.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {isPartner ? (
                  <Button size="lg" onClick={() => navigate("/partner/dashboard")}
                    className="text-lg px-8 py-6 shadow-lg shadow-primary/20">
                    Кабинет партнёра <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                ) : (
                  <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming}
                    className="text-lg px-8 py-6 shadow-lg shadow-primary/20">
                    Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                )}
                <Button size="lg" variant="outline" asChild className="text-lg px-8 py-6">
                  <Link to="/partner/offer">Условия программы</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default PartnerLanding;
