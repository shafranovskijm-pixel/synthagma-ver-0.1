import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowRight, Gift, TrendingUp, Users, Clock, DollarSign, CheckCircle2, Copy, ExternalLink, Zap, Shield, BarChart3, MessageCircle, Mail, FileText, Building2, GraduationCap, Briefcase, Star, Sparkles } from "lucide-react";
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

  const brandName = "СИНТАГМА";
  const charVariants = {
    hidden: { opacity: 0, y: 30, rotateX: -90 },
    visible: (i: number) => ({
      opacity: 1, y: 0, rotateX: 0,
      transition: { delay: 0.8 + i * 0.08, type: "spring" as const, damping: 12, stiffness: 200 }
    }),
  };

  const refLink = partnerCode ? `${getBaseUrl()}/register?ref=${partnerCode}` : getBaseUrl();

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
    { level: "Стартовый", clients: "0–5", percent: "10%", intensity: "bg-teal-500/5 border-teal-500/10" },
    { level: "Базовый", clients: "6–15", percent: "15%", intensity: "bg-teal-500/10 border-teal-500/15" },
    { level: "Продвинутый", clients: "16–30", percent: "20%", intensity: "bg-teal-500/15 border-teal-500/20" },
    { level: "Эксперт", clients: "31+", percent: "25%", intensity: "bg-teal-500/25 border-teal-500/30" },
  ];

  const messengerText = `🎓 Я использую платформу СИНТАГМА для дистанционного обучения — современная LMS с документооборотом, ФРДО, видеоидентификацией и ИИ.\n\nПопробуйте бесплатно: ${getBaseUrl()}`;

  const socialText = `Для обучения сотрудников использую СИНТАГМА — платформу с полным функционалом:\n\n1. Бесплатный тариф для старта\n2. Безлимит учеников на всех тарифах\n3. ИИ-генерация курсов за минуты\n4. Встроенный документооборот и ФРДО\n5. Видеоидентификация и прокторинг\n6. Онлайн-касса и приём платежей\n7. Охрана труда и журналы\n\nПопробуйте: ${getBaseUrl()}`;

  const b2bText = `Предлагаю рассмотреть платформу СИНТАГМА для организации дистанционного обучения в вашей компании.\n\nОсновные возможности:\n• Конструктор курсов с ИИ-генерацией контента\n• Встроенный документооборот (договоры, акты, согласия)\n• Интеграция с ФРДО для передачи данных об образовании\n• Видеоидентификация и прокторинг экзаменов\n• Модуль охраны труда с журналами и протоколами\n• Онлайн-касса и приём платежей (комиссия от 2,8%)\n• Безлимит учеников на всех тарифах\n\nБесплатный тестовый период — 14 дней.\nПодробнее: ${getBaseUrl()}`;

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Текст скопирован!" });
  };

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
                <Button onClick={() => navigate("/partner/dashboard")} className="bg-teal-500 hover:bg-teal-600 text-white shadow-[0_0_20px_rgba(20,184,166,0.25)]">
                  Кабинет партнёра
                </Button>
              ) : (
                <Button onClick={handleBecomePartner} disabled={isBecoming} className="bg-teal-500 hover:bg-teal-600 text-white shadow-[0_0_20px_rgba(20,184,166,0.25)]">
                  {isBecoming ? "Загрузка..." : "Стать партнёром"}
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="py-24 lg:py-36 relative overflow-hidden">
          {/* Teal gradient mesh background */}
          <div className="absolute inset-0 bg-gradient-to-br from-teal-500/8 via-transparent to-cyan-500/6" />
          <div className="absolute top-20 left-10 w-72 h-72 bg-teal-500/8 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-cyan-400/6 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-500/3 rounded-full blur-[100px]" />

          {/* Floating decorative elements */}
          <motion.div
            className="absolute top-32 right-[15%] w-20 h-20 border-2 border-teal-500/20 rounded-2xl"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute bottom-24 left-[10%] w-12 h-12 bg-teal-500/15 rounded-full"
            animate={{ y: [-10, 10, -10] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/2 right-[8%] w-3 h-3 bg-cyan-400/40 rounded-full"
            animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <motion.div
            className="absolute top-24 left-[25%] w-16 h-16 border border-teal-400/15 rounded-xl"
            animate={{ rotate: -360, y: [-5, 5, -5] }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute bottom-32 right-[25%] w-6 h-6 bg-teal-500/20 rounded-lg"
            animate={{ rotate: 45, scale: [1, 1.2, 1] }}
            transition={{ duration: 5, repeat: Infinity }}
          />

          <div className="container mx-auto px-6 relative">
            <div className="max-w-3xl mx-auto text-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <Badge className="mb-6 px-4 py-1.5 text-sm bg-teal-500/10 text-teal-600 border-teal-500/20 hover:bg-teal-500/15">
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
                <span className="inline-flex text-teal-500">
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
                Рекомендуйте нашу платформу и получайте до <strong className="text-teal-600">25%</strong> от оплат 
                привлечённых организаций в течение <strong className="text-teal-600">2 лет</strong>.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.8, duration: 0.6 }}
              >
                {isPartner && partnerCode ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-sm text-muted-foreground">Ваша реферальная ссылка:</p>
                    <div className="flex items-center gap-2 bg-teal-500/5 rounded-xl px-5 py-3 border border-teal-500/20 backdrop-blur-sm">
                      <code className="text-sm font-mono text-teal-700">{refLink}</code>
                      <Button size="icon" variant="ghost" className="text-teal-600 hover:bg-teal-500/10" onClick={() => copyText(refLink)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button onClick={() => navigate("/partner/dashboard")} size="lg" className="mt-2 bg-teal-500 hover:bg-teal-600 text-white shadow-[0_0_30px_rgba(20,184,166,0.3)]">
                      Перейти в кабинет <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming}
                    className="text-lg px-10 py-7 rounded-xl bg-teal-500 hover:bg-teal-600 text-white shadow-[0_0_40px_rgba(20,184,166,0.3)] hover:shadow-[0_0_60px_rgba(20,184,166,0.4)] transition-all duration-300">
                    <Sparkles className="w-5 h-5 mr-2" />
                    Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                )}
              </motion.div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-teal-500/3 via-transparent to-teal-500/3" />
          <div className="container mx-auto px-6 relative">
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
                  <Card className="text-center h-full border border-teal-500/10 shadow-md hover:shadow-lg hover:shadow-teal-500/5 transition-all bg-card/80 backdrop-blur-sm">
                    <CardContent className="pt-8 pb-6">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-400/10 flex items-center justify-center mx-auto mb-5 relative">
                        <step.icon className="w-7 h-7 text-teal-600" />
                        <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-teal-500 text-white text-xs font-bold flex items-center justify-center shadow-lg shadow-teal-500/30">
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
                  <Card className="h-full border border-teal-500/10 shadow-md hover:shadow-lg hover:shadow-teal-500/5 transition-all">
                    <CardContent className="pt-6">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/15 to-cyan-400/5 flex items-center justify-center mb-4">
                        <b.icon className="w-6 h-6 text-teal-600" />
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
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-teal-500/3 via-transparent to-teal-500/3" />
          <div className="container mx-auto px-6 relative">
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
                  <div className={`flex items-center justify-between px-6 py-5 rounded-xl ${row.intensity} border backdrop-blur-sm hover:scale-[1.01] transition-transform`}>
                    <div>
                      <div className="font-semibold">{row.level}</div>
                      <div className="text-sm text-muted-foreground">{row.clients} клиентов</div>
                    </div>
                    <div className="text-3xl font-bold text-teal-500">{row.percent}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Promo materials */}
        <section className="py-24">
          <div className="container mx-auto px-6">
            <motion.div
              className="text-center mb-14"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Badge className="mb-4 px-3 py-1 bg-teal-500/10 text-teal-600 border-teal-500/20">
                <Star className="w-3.5 h-3.5 mr-1" /> Готовые материалы
              </Badge>
              <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4">
                Рекламные материалы
              </h2>
              <p className="text-muted-foreground max-w-lg mx-auto">
                Скопируйте готовый текст и отправьте — адаптируйте под свою аудиторию
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {/* Messenger text */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <Card className="h-full border border-teal-500/10 shadow-md hover:shadow-lg hover:shadow-teal-500/5 transition-all">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/15 to-cyan-400/5 flex items-center justify-center">
                        <MessageCircle className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Для мессенджеров</h3>
                        <p className="text-xs text-muted-foreground">WhatsApp, Telegram, VK</p>
                      </div>
                    </div>
                    <div className="bg-teal-500/5 border border-teal-500/10 rounded-xl p-4">
                      <p className="text-sm leading-relaxed whitespace-pre-line">{messengerText}</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 border-teal-500/20 text-teal-600 hover:bg-teal-500/10" onClick={() => copyText(messengerText)}>
                      <Copy className="w-3.5 h-3.5" /> Копировать текст
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Social post */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
              >
                <Card className="h-full border border-teal-500/10 shadow-md hover:shadow-lg hover:shadow-teal-500/5 transition-all">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/15 to-cyan-400/5 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Для соцсетей</h3>
                        <p className="text-xs text-muted-foreground">Пост, статья, блог</p>
                      </div>
                    </div>
                    <div className="bg-teal-500/5 border border-teal-500/10 rounded-xl p-4 max-h-48 overflow-y-auto">
                      <p className="text-sm leading-relaxed whitespace-pre-line">{socialText}</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 border-teal-500/20 text-teal-600 hover:bg-teal-500/10" onClick={() => copyText(socialText)}>
                      <Copy className="w-3.5 h-3.5" /> Копировать текст
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* B2B email / commercial proposal */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
              >
                <Card className="h-full border border-teal-500/10 shadow-md hover:shadow-lg hover:shadow-teal-500/5 transition-all">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/15 to-cyan-400/5 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Для B2B / email</h3>
                        <p className="text-xs text-muted-foreground">Коммерческое предложение</p>
                      </div>
                    </div>
                    <div className="bg-teal-500/5 border border-teal-500/10 rounded-xl p-4 max-h-48 overflow-y-auto">
                      <p className="text-sm leading-relaxed whitespace-pre-line">{b2bText}</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 border-teal-500/20 text-teal-600 hover:bg-teal-500/10" onClick={() => copyText(b2bText)}>
                      <Copy className="w-3.5 h-3.5" /> Копировать текст
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Who to recommend */}
            <motion.div
              className="mt-20 max-w-4xl mx-auto"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <h3 className="font-display text-2xl font-bold text-center mb-8">Кому рекомендовать</h3>
              <div className="grid sm:grid-cols-3 gap-6">
                {[
                  { icon: Building2, title: "Учебные центры", desc: "Центры ДПО, повышения квалификации, переподготовки", color: "from-teal-500/15 to-teal-600/5" },
                  { icon: Briefcase, title: "Компании", desc: "Обучение персонала, охрана труда, аттестация", color: "from-cyan-500/15 to-teal-500/5" },
                  { icon: GraduationCap, title: "Образовательные организации", desc: "Школы, колледжи, университеты — дистанционное обучение", color: "from-teal-400/15 to-cyan-400/5" },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    whileHover={{ y: -4 }}
                    transition={{ type: "spring", damping: 20 }}
                  >
                    <Card className="border border-teal-500/10 shadow-md hover:shadow-lg hover:shadow-teal-500/5 text-center transition-all h-full">
                      <CardContent className="pt-6 pb-5">
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto mb-4`}>
                          <item.icon className="w-7 h-7 text-teal-600" />
                        </div>
                        <h4 className="font-semibold mb-1.5">{item.title}</h4>
                        <p className="text-sm text-muted-foreground">{item.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-teal-500/5 via-teal-600/10 to-cyan-500/5" />
          <div className="absolute top-20 left-20 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-48 h-48 bg-cyan-400/5 rounded-full blur-3xl" />
          
          {/* Decorative corners */}
          <div className="absolute top-8 left-8 w-24 h-24 border-t-2 border-l-2 border-teal-500/20 rounded-tl-3xl" />
          <div className="absolute bottom-8 right-8 w-24 h-24 border-b-2 border-r-2 border-teal-500/20 rounded-br-3xl" />
          
          <motion.div
            className="absolute top-1/2 left-[5%] w-2 h-2 bg-teal-500/40 rounded-full"
            animate={{ y: [-8, 8, -8], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <motion.div
            className="absolute top-1/3 right-[8%] w-3 h-3 bg-cyan-400/30 rounded-full"
            animate={{ scale: [1, 1.5, 1] }}
            transition={{ duration: 4, repeat: Infinity }}
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
                    className="text-lg px-8 py-6 bg-teal-500 hover:bg-teal-600 text-white shadow-[0_0_30px_rgba(20,184,166,0.3)]">
                    Кабинет партнёра <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                ) : (
                  <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming}
                    className="text-lg px-8 py-6 bg-teal-500 hover:bg-teal-600 text-white shadow-[0_0_30px_rgba(20,184,166,0.3)]">
                    Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                )}
                <Button size="lg" variant="outline" asChild className="text-lg px-8 py-6 border-teal-500/20 text-teal-600 hover:bg-teal-500/10">
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
