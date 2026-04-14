import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowRight, Gift, TrendingUp, Users, Clock, DollarSign, CheckCircle2, Copy, ExternalLink, Zap, Shield, BarChart3, MessageCircle, Mail, FileText, Building2, GraduationCap, Briefcase, Star, Sparkles, Download, HelpCircle } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Footer } from "@/components/landing/Footer";
import { Helmet } from "react-helmet-async";
import { getBaseUrl } from "@/utils/getBaseUrl";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FloatingParticles } from "@/components/landing/FloatingParticles";
import { toast } from "sonner";

const PartnerLanding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isPartner, setIsPartner] = useState(false);
  const [partnerCode, setPartnerCode] = useState<string | null>(null);
  const [isBecoming, setIsBecoming] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

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
      toast.success("Вы стали партнёром!", { description: Ваш реферальный код: ${data} });
    } catch (e: any) {
      toast.error("Ошибка", { description: e.message });
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
    { level: "Стартовый", clients: "0–5", percent: "10%", intensity: "from-teal-500/5 to-teal-500/10 border-teal-500/15" },
    { level: "Базовый", clients: "6–15", percent: "15%", intensity: "from-teal-500/10 to-teal-500/15 border-teal-500/20" },
    { level: "Продвинутый", clients: "16–30", percent: "20%", intensity: "from-teal-500/15 to-teal-500/20 border-teal-500/25" },
    { level: "Эксперт", clients: "31+", percent: "25%", intensity: "from-teal-500/20 to-teal-500/30 border-teal-500/35" },
  ];

  const messengerText = `🎓 Я использую платформу СИНТАГМА для дистанционного обучения — современная LMS с документооборотом, ФРДО, видеоидентификацией и ИИ.\n\nПопробуйте бесплатно: ${getBaseUrl()}`;
  const socialText = `Для обучения сотрудников использую СИНТАГМА — платформу с полным функционалом:\n\n1. Бесплатный тариф для старта\n2. Безлимит учеников на всех тарифах\n3. ИИ-генерация курсов за минуты\n4. Встроенный документооборот и ФРДО\n5. Видеоидентификация и прокторинг\n6. Онлайн-касса и приём платежей\n7. Охрана труда и журналы\n\nПопробуйте: ${getBaseUrl()}`;
  const b2bText = `Предлагаю рассмотреть платформу СИНТАГМА для организации дистанционного обучения в вашей компании.\n\nОсновные возможности:\n• Конструктор курсов с ИИ-генерацией контента\n• Встроенный документооборот (договоры, акты, согласия)\n• Интеграция с ФРДО для передачи данных об образовании\n• Видеоидентификация и прокторинг экзаменов\n• Модуль охраны труда с журналами и протоколами\n• Онлайн-касса и приём платежей (комиссия от 2,8%)\n• Безлимит учеников на всех тарифах\n\nБесплатный тестовый период — 14 дней.\nПодробнее: ${getBaseUrl()}`;

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Текст скопирован!");
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

        {/* Hero — dark section */}
        <section className="relative py-28 lg:py-40 overflow-hidden bg-foreground">
          {/* Radial teal glows */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(20,184,166,0.15),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(6,182,212,0.1),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(20,184,166,0.05),transparent_70%)]" />
          
          {/* Dot pattern */}
          <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:32px_32px]" />
          
          {/* Decorative vertical lines */}
          <motion.div
            className="absolute left-[15%] top-0 w-px h-full bg-gradient-to-b from-transparent via-teal-400/20 to-transparent"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
          <motion.div
            className="absolute right-[15%] top-0 w-px h-full bg-gradient-to-b from-transparent via-teal-400/15 to-transparent"
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
          />
          
          {/* Corner decorations */}
          <motion.div
            className="absolute top-8 left-8 w-20 h-20 border-t-2 border-l-2 border-teal-400/20 rounded-tl-3xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.8 }}
          />
          <motion.div
            className="absolute bottom-8 right-8 w-20 h-20 border-b-2 border-r-2 border-teal-400/20 rounded-br-3xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          />

          <FloatingParticles count={18} mode="mixed" />

          <div className="container mx-auto px-6 section-padding relative z-10">
            <div className="max-w-3xl mx-auto text-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <Badge className="mb-6 px-4 py-1.5 text-sm bg-teal-500/15 text-teal-300 border-teal-500/30 hover:bg-teal-500/20">
                  <Gift className="w-4 h-4 mr-1.5" /> Партнёрская программа
                </Badge>
              </motion.div>

              <motion.h1
                className="font-display text-4xl lg:text-6xl font-bold mb-6 tracking-tight text-white"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.7 }}
              >
                Зарабатывайте вместе с{" "}
                <span className="inline-flex text-teal-400 drop-shadow-[0_0_20px_rgba(20,184,166,0.4)]">
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
                className="text-xl text-white/60 mb-10 max-w-2xl mx-auto leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 0.8 }}
              >
                Рекомендуйте нашу платформу и получайте до <strong className="text-teal-400">25%</strong> от оплат 
                привлечённых организаций в течение <strong className="text-teal-400">2 лет</strong>.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.8, duration: 0.6 }}
              >
                {isPartner && partnerCode ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-sm text-white/50">Ваша реферальная ссылка:</p>
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-5 py-3 border border-teal-500/20 backdrop-blur-sm">
                      <code className="text-sm font-mono text-teal-300">{refLink}</code>
                      <Button size="icon" variant="ghost" className="text-teal-400 hover:bg-white/10" onClick={() => copyText(refLink)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <Button onClick={() => navigate("/partner/dashboard")} size="lg" className="mt-2 bg-teal-500 hover:bg-teal-600 text-white shadow-[0_0_30px_rgba(20,184,166,0.4)]">
                      Перейти в кабинет <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="hero-agree"
                        checked={agreedToTerms}
                        onCheckedChange={(v) => setAgreedToTerms(v === true)}
                        className="border-teal-500/50 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                      />
                      <label htmlFor="hero-agree" className="text-sm text-white/50 cursor-pointer">
                        Я согласен с{" "}
                        <Link to="/partner/offer" className="text-teal-400 underline underline-offset-2 hover:text-teal-300">
                          условиями партнёрской программы
                        </Link>
                      </label>
                    </div>
                    <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming || !agreedToTerms}
                      className="text-lg px-10 py-7 rounded-xl bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_40px_rgba(20,184,166,0.4)] hover:shadow-[0_0_60px_rgba(20,184,166,0.5)] transition-all duration-300 disabled:opacity-50">
                      <Sparkles className="w-5 h-5 mr-2" />
                      Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-24 relative overflow-hidden bg-gradient-to-b from-secondary/30 via-background to-secondary/30 section-padding">
          <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] [background-size:24px_24px]" />
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
                  <Card className="text-center h-full border border-teal-500/10 shadow-lg hover:shadow-xl hover:shadow-teal-500/5 transition-all bg-card/80 backdrop-blur-sm group">
                    <CardContent className="pt-8 pb-6">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-400/10 flex items-center justify-center mx-auto mb-5 relative group-hover:shadow-[0_0_20px_rgba(20,184,166,0.15)] transition-shadow">
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
        <section className="py-24 relative overflow-hidden section-padding">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(20,184,166,0.06),transparent_60%)]" />
          <FloatingParticles count={10} mode="dots" />
          <div className="container mx-auto px-6 relative">
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
                  whileHover={{ y: -6 }}
                >
                  <Card className="h-full border border-teal-500/10 shadow-lg hover:shadow-xl hover:shadow-teal-500/10 transition-all bg-card/80 backdrop-blur-sm group">
                    <CardContent className="pt-6">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-400/10 flex items-center justify-center mb-4 group-hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-shadow">
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
        <section className="py-24 relative overflow-hidden bg-gradient-to-b from-secondary/30 via-background to-secondary/30 section-padding">
          <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] [background-size:24px_24px]" />
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
                  <div className={`flex items-center justify-between px-6 py-5 rounded-xl bg-gradient-to-r ${row.intensity} border backdrop-blur-sm hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(20,184,166,0.08)] transition-all duration-300`}>
                    <div>
                      <div className="font-semibold">{row.level}</div>
                      <div className="text-sm text-muted-foreground">{row.clients} клиентов</div>
                    </div>
                    <div className="text-3xl font-bold text-teal-500 drop-shadow-[0_0_8px_rgba(20,184,166,0.3)]">{row.percent}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Promo materials — dark section */}
        <section className="py-24 relative overflow-hidden bg-foreground section-padding">
          {/* Radial glows */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(20,184,166,0.1),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(6,182,212,0.08),transparent_60%)]" />
          {/* Dot pattern */}
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:32px_32px]" />

          <FloatingParticles count={12} mode="dots" />

          <div className="container mx-auto px-6 relative z-10">
            <motion.div
              className="text-center mb-14"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Badge className="mb-4 px-3 py-1 bg-teal-500/15 text-teal-300 border-teal-500/30">
                <Star className="w-3.5 h-3.5 mr-1" /> Готовые материалы
              </Badge>
              <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-white">
                Рекламные материалы
              </h2>
              <p className="text-white/50 max-w-lg mx-auto">
                Скопируйте готовый текст и отправьте — адаптируйте под свою аудиторию
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                { icon: MessageCircle, title: "Для мессенджеров", sub: "WhatsApp, Telegram, VK", text: messengerText },
                { icon: FileText, title: "Для соцсетей", sub: "Пост, статья, блог", text: socialText },
                { icon: Mail, title: "Для B2B / email", sub: "Коммерческое предложение", text: b2bText },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card className="h-full border border-teal-500/15 bg-white/[0.03] backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-teal-500/5 transition-all group hover:border-teal-500/25">
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-teal-500/15 flex items-center justify-center group-hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-shadow">
                          <item.icon className="w-5 h-5 text-teal-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-white">{item.title}</h3>
                          <p className="text-xs text-white/40">{item.sub}</p>
                        </div>
                      </div>
                      <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 max-h-48 overflow-y-auto">
                        <p className="text-sm leading-relaxed whitespace-pre-line text-white/60">{item.text}</p>
                      </div>
                      <Button size="sm" variant="outline" className="gap-1.5 border-teal-500/20 text-teal-400 hover:bg-teal-500/10 hover:text-teal-300" onClick={() => copyText(item.text)}>
                        <Copy className="w-3.5 h-3.5" /> Копировать текст
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Downloadable promo materials */}
            <motion.div
              className="mt-12 max-w-5xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <h3 className="font-display text-lg font-semibold mb-4 text-center text-white/80">Дополнительные материалы для скачивания</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { name: "Возможности и тарифы СИНТАГМА (для организаций).pdf", type: "PDF", color: "bg-red-500/15 text-red-400", href: "/promo/tariffs-organizations.pdf" },
                  { name: "Возможности и тарифы СИНТАГМА (для онлайн-школ).pdf", type: "PDF", color: "bg-red-500/15 text-red-400", href: "/promo/tariffs-online-schools.pdf" },
                  { name: "Рекламные баннеры СИНТАГМА.zip", type: "ZIP", color: "bg-amber-500/15 text-amber-400", href: "/promo/banners-sintagma.zip" },
                ].map((file, i) => (
                  <a
                    key={i}
                    href={file.href}
                    download
                    className="flex items-center gap-3 p-4 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-teal-500/20 transition-all group"
                  >
                    <Badge className={`${file.color} border-0 text-xs font-bold px-2 py-0.5`}>{file.type}</Badge>
                    <span className="text-sm flex-1 leading-tight text-white/70 group-hover:text-white/90 transition-colors">{file.name}</span>
                    <Download className="w-4 h-4 text-white/30 group-hover:text-teal-400 transition-colors shrink-0" />
                  </a>
                ))}
              </div>
            </motion.div>

            {/* Who to recommend */}
            <motion.div
              className="mt-20 max-w-4xl mx-auto"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <h3 className="font-display text-2xl font-bold text-center mb-8 text-white">Кому рекомендовать</h3>
              <div className="grid sm:grid-cols-3 gap-6">
                {[
                  { icon: Building2, title: "Учебные центры", desc: "Центры ДПО, повышения квалификации, переподготовки" },
                  { icon: Briefcase, title: "Компании", desc: "Обучение персонала, охрана труда, аттестация" },
                  { icon: GraduationCap, title: "Образовательные организации", desc: "Школы, колледжи, университеты — дистанционное обучение" },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    whileHover={{ y: -4 }}
                    transition={{ type: "spring", damping: 20 }}
                  >
                    <Card className="border border-teal-500/15 bg-white/[0.03] backdrop-blur-sm text-center transition-all h-full hover:border-teal-500/25 hover:shadow-[0_0_25px_rgba(20,184,166,0.08)] group">
                      <CardContent className="pt-6 pb-5">
                        <div className="w-14 h-14 rounded-2xl bg-teal-500/15 flex items-center justify-center mx-auto mb-4 group-hover:shadow-[0_0_20px_rgba(20,184,166,0.2)] transition-shadow">
                          <item.icon className="w-7 h-7 text-teal-400" />
                        </div>
                        <h4 className="font-semibold mb-1.5 text-white">{item.title}</h4>
                        <p className="text-sm text-white/50">{item.desc}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-24 relative overflow-hidden bg-gradient-to-b from-secondary/30 via-background to-secondary/30 section-padding">
          <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="container mx-auto px-6 relative">
            <motion.div
              className="text-center mb-14"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Badge className="mb-4 px-3 py-1 bg-teal-500/10 text-teal-600 border-teal-500/20">
                <HelpCircle className="w-3.5 h-3.5 mr-1" /> FAQ
              </Badge>
              <h2 className="font-display text-3xl lg:text-4xl font-bold">Частые вопросы</h2>
            </motion.div>

            <motion.div
              className="max-w-3xl mx-auto"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <Accordion type="single" collapsible className="space-y-3">
                {[
                  { q: "Как подключиться к партнёрской программе и начать зарабатывать?", a: "Зарегистрируйтесь на платформе СИНТАГМА и нажмите кнопку «Стать партнёром». Вы получите персональную реферальную ссылку — делитесь ею с потенциальными клиентами. Когда организация зарегистрируется по вашей ссылке и начнёт оплачивать тарифы, вам автоматически начисляется комиссия." },
                  { q: "Кто может участвовать в партнёрской программе?", a: "Любой пользователь платформы: частное лицо, ИП, организация. Программа подходит для бизнес-тренеров, консультантов, HR-специалистов, блогеров и всех, кто может рекомендовать обучающую платформу своей аудитории." },
                  { q: "Как отслеживаются регистрации и оплаты рефералов?", a: "Все переходы по вашей ссылке, регистрации и оплаты автоматически фиксируются в системе. В личном кабинете партнёра вы видите полную статистику: клики, регистрации, конверсию и начисленные комиссии." },
                  { q: "Каким образом происходят выплаты комиссии?", a: "Комиссия начисляется автоматически при каждой оплате привлечённого клиента. Выплаты производятся по запросу на банковский счёт или по реквизитам, указанным в кабинете партнёра." },
                  { q: "Можно ли заключить договор?", a: "Да, для юридических лиц и ИП мы заключаем партнёрский договор. Свяжитесь с нами через форму обратной связи или напишите на email для оформления документов." },
                  { q: "Как организована отчётность по выплатам?", a: "В кабинете партнёра доступна полная история начислений и выплат. Вы можете выгрузить отчёт за любой период. Для юридических лиц формируются акты выполненных работ." },
                ].map((item, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="border border-teal-500/10 rounded-xl px-5 data-[state=open]:bg-teal-500/3 backdrop-blur-sm">
                    <AccordionTrigger className="text-left text-sm font-medium hover:no-underline py-4">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </div>
        </section>

        {/* CTA — dark section */}
        <section className="py-28 relative overflow-hidden bg-foreground">
          {/* Radial glows */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(20,184,166,0.12),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgba(6,182,212,0.08),transparent_60%)]" />
          {/* Dot pattern */}
          <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:32px_32px]" />

          {/* Corner decorations */}
          <motion.div
            className="absolute top-8 left-8 w-24 h-24 border-t-2 border-l-2 border-teal-400/20 rounded-tl-3xl"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.8 }}
          />
          <motion.div
            className="absolute bottom-8 right-8 w-24 h-24 border-b-2 border-r-2 border-teal-400/20 rounded-br-3xl"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5, duration: 0.8 }}
          />

          {/* Decorative floating elements */}
          <motion.div
            className="absolute top-1/2 left-[5%] w-2 h-2 bg-teal-400/40 rounded-full"
            animate={{ y: [-8, 8, -8], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <motion.div
            className="absolute top-1/3 right-[8%] w-3 h-3 bg-cyan-400/30 rounded-full"
            animate={{ scale: [1, 1.5, 1] }}
            transition={{ duration: 4, repeat: Infinity }}
          />

          <FloatingParticles count={8} mode="dots" />

          <div className="container mx-auto px-6 text-center relative z-10">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
              <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-white">Начните зарабатывать уже сегодня</h2>
              <p className="text-white/50 mb-10 max-w-lg mx-auto text-lg">
                Регистрация занимает 1 минуту. Получите персональную ссылку и начните привлекать клиентов.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {isPartner ? (
                  <Button size="lg" onClick={() => navigate("/partner/dashboard")}
                    className="text-lg px-8 py-6 bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_30px_rgba(20,184,166,0.4)]">
                    Кабинет партнёра <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="cta-agree"
                        checked={agreedToTerms}
                        onCheckedChange={(v) => setAgreedToTerms(v === true)}
                        className="border-teal-500/50 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                      />
                      <label htmlFor="cta-agree" className="text-sm text-white/50 cursor-pointer">
                        Я согласен с{" "}
                        <Link to="/partner/offer" className="text-teal-400 underline underline-offset-2 hover:text-teal-300">
                          условиями партнёрской программы
                        </Link>
                      </label>
                    </div>
                    <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming || !agreedToTerms}
                      className="text-lg px-8 py-6 bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_30px_rgba(20,184,166,0.4)] disabled:opacity-50">
                      Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                )}
                <Button size="lg" variant="outline" asChild className="text-lg px-8 py-6 border-teal-500/25 text-teal-400 hover:bg-teal-500/10 hover:text-teal-300">
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
