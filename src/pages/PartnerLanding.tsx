import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { ArrowRight, Gift, Copy, Sparkles, Star, BarChart3, MessageCircle, Mail, FileText, Download, HelpCircle, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Footer } from "@/components/landing/Footer";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { Helmet } from "react-helmet-async";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FloatingParticles } from "@/components/landing/FloatingParticles";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";
import { InfiniteMarquee } from "@/components/partner/InfiniteMarquee";
import { usePartnerLanding } from "@/hooks/usePartnerLanding";
import {
  steps, benefits, networkLevels, bonuses, whyEasyToSell, caseStudies,
  priceOptions, faqItems, platformStats, downloadMaterials, recommendTargets,
  formatRub, buildPromoTexts,
} from "@/components/partner/partnerLandingData";

const brandName = "СИНТАГМА";
const charVariants = {
  hidden: { opacity: 0, y: 30, rotateX: -90 },
  visible: (i: number) => ({
    opacity: 1, y: 0, rotateX: 0,
    transition: { delay: 0.8 + i * 0.08, type: "spring" as const, damping: 12, stiffness: 200 }
  }),
};

const PartnerLanding = () => {
  const {
    navigate, isPartner, partnerCode, isBecoming, agreedToTerms, setAgreedToTerms,
    calcLevel1, setCalcLevel1, calcLevel2, setCalcLevel2, calcLevel3, setCalcLevel3,
    calcAvgPrice, setCalcAvgPrice, calcIncome1, calcIncome2, calcIncome3,
    calcTurnoverBonus, calcGrandTotal, handleBecomePartner, refLink, copyText,
  } = usePartnerLanding();

  const promoTexts = buildPromoTexts(refLink);
  const promoMaterials = [
    { icon: MessageCircle, title: "Для мессенджеров", sub: "WhatsApp, Telegram, VK", text: promoTexts.messenger },
    { icon: FileText, title: "Для соцсетей", sub: "Пост, статья, блог", text: promoTexts.social },
    { icon: Mail, title: "Для B2B / email", sub: "Коммерческое предложение", text: promoTexts.b2b },
  ];

  return (
    <>
      <Helmet>
        <title>Партнёрская программа — СИНТАГМА | До 45% комиссии</title>
        <meta name="description" content="Многоуровневая партнёрская программа СИНТАГМА. До 45% комиссии с 3 уровней сети. Бонусы за оборот и лидерский рейтинг." />
      </Helmet>

      <div className="min-h-screen bg-background overflow-hidden">
        <LandingHeader />

        {/* Hero */}
        <section className="relative py-28 lg:py-40 overflow-hidden bg-[#0a0e1a]">
          <StarfieldCanvas />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(20,184,166,0.15),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_80%,rgba(6,182,212,0.1),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(20,184,166,0.05),transparent_70%)]" />
          <motion.div className="absolute left-[15%] top-0 w-px h-full bg-gradient-to-b from-transparent via-teal-400/20 to-transparent" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 1.5 }} />
          <motion.div className="absolute right-[15%] top-0 w-px h-full bg-gradient-to-b from-transparent via-teal-400/15 to-transparent" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 1.5, delay: 0.3 }} />
          <motion.div className="absolute top-8 left-8 w-20 h-20 border-t-2 border-l-2 border-teal-400/20 rounded-tl-3xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.8 }} />
          <motion.div className="absolute bottom-8 right-8 w-20 h-20 border-b-2 border-r-2 border-teal-400/20 rounded-br-3xl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.8 }} />
          <FloatingParticles count={18} mode="mixed" />
          <div className="container mx-auto px-6 section-padding relative z-10">
            <div className="max-w-3xl mx-auto text-center">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
                <Badge className="mb-6 px-4 py-1.5 text-sm bg-teal-500/15 text-teal-300 border-teal-500/30 hover:bg-teal-500/20">
                  <Gift className="w-4 h-4 mr-1.5" /> Многоуровневая партнёрская программа
                </Badge>
              </motion.div>
              <motion.h1 className="font-display text-4xl lg:text-6xl font-bold mb-6 tracking-tight text-white" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.7 }}>
                Зарабатывайте до{" "}
                <span className="text-teal-400 drop-shadow-[0_0_20px_rgba(20,184,166,0.4)]">45%</span>{" "}с{" "}
                <span className="inline-flex text-teal-400 drop-shadow-[0_0_20px_rgba(20,184,166,0.4)]">
                  {brandName.split("").map((char, i) => (
                    <motion.span key={i} custom={i} variants={charVariants} initial="hidden" animate="visible" className="inline-block">{char}</motion.span>
                  ))}
                </span>
              </motion.h1>
              <motion.p className="text-xl text-white/60 mb-10 max-w-2xl mx-auto leading-relaxed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5, duration: 0.8 }}>
                3 уровня комиссии • Бонус за оборот +5% • Лидерский бонус +3% • Выплаты 2 года
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8, duration: 0.6 }}>
                {isPartner && partnerCode ? (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-sm text-white/50">Ваша реферальная ссылка:</p>
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-5 py-3 border border-teal-500/20 backdrop-blur-sm">
                      <code className="text-sm font-mono text-teal-300">{refLink}</code>
                      <Button size="icon" variant="ghost" className="text-teal-400 hover:bg-white/10" onClick={() => copyText(refLink)}><Copy className="w-4 h-4" /></Button>
                    </div>
                    <Button onClick={() => navigate("/partner/dashboard")} size="lg" className="mt-2 bg-teal-500 hover:bg-teal-600 text-white shadow-[0_0_30px_rgba(20,184,166,0.4)]">
                      Перейти в кабинет <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox id="hero-agree" checked={agreedToTerms} onCheckedChange={(v) => setAgreedToTerms(v === true)} className="border-teal-500/50 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500" />
                      <label htmlFor="hero-agree" className="text-sm text-white/50 cursor-pointer">
                        Я согласен с{" "}<Link to="/partner/offer" className="text-teal-400 underline underline-offset-2 hover:text-teal-300">условиями партнёрской программы</Link>
                      </label>
                    </div>
                    <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming || !agreedToTerms} className="text-lg px-10 py-7 rounded-xl bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_40px_rgba(20,184,166,0.4)] hover:shadow-[0_0_60px_rgba(20,184,166,0.5)] transition-all duration-300 disabled:opacity-50">
                      <Sparkles className="w-5 h-5 mr-2" /> Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </section>

        {/* Comic: Why easy to sell */}
        <section className="py-24 relative overflow-hidden bg-gradient-to-b from-secondary/30 via-background to-secondary/30 section-padding">
          <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(circle_1.5px_at_8px_8px,hsl(var(--foreground))_1px,transparent_0)] [background-size:16px_16px]" />
          <div className="container mx-auto px-6 relative">
            <motion.div className="text-center mb-4" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <Badge className="mb-4 px-3 py-1 bg-teal-500/10 text-teal-600 border-teal-500/20"><Zap className="w-3.5 h-3.5 mr-1" /> Ваше преимущество</Badge>
              <h2 className="font-display text-3xl lg:text-4xl font-bold">Почему легко привлекать клиентов</h2>
            </motion.div>
            <motion.p className="text-muted-foreground text-center mb-14 max-w-2xl mx-auto" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>Платформа продаёт себя сама — вам достаточно показать возможности</motion.p>
            <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
              {whyEasyToSell.map((item, i) => (
                <motion.div key={item.title} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} whileHover={{ scale: 1.03, rotate: 0 }} style={{ rotate: item.rotate }} className="relative">
                  <div className="border-[3px] border-foreground/80 rounded-lg overflow-hidden bg-card shadow-[4px_4px_0px_0px_hsl(var(--foreground)/0.15)] hover:shadow-[6px_6px_0px_0px_hsl(var(--foreground)/0.2)] transition-shadow">
                    <div className="relative h-36 lg:h-44 overflow-hidden">
                      <img src={item.image} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
                      <div className="absolute top-2 right-2 bg-amber-400 text-foreground font-extrabold text-xs px-2 py-1 rounded-full border-2 border-foreground/60 shadow-lg" style={{ transform: "rotate(8deg)" }}>{item.accent}</div>
                    </div>
                    <div className="p-3 lg:p-4 relative">
                      <div className="absolute -top-3 left-4 w-4 h-4 bg-card border-t-[3px] border-l-[3px] border-foreground/80" style={{ transform: "rotate(45deg)" }} />
                      <h3 className="font-bold text-sm lg:text-base mb-1">{item.title}</h3>
                      <p className="text-xs lg:text-sm text-muted-foreground leading-snug">{item.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-24 relative overflow-hidden section-padding">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(20,184,166,0.06),transparent_60%)]" />
          <div className="container mx-auto px-6 relative mb-10">
            <motion.h2 className="font-display text-3xl lg:text-4xl font-bold text-center mb-4" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>Как это работает</motion.h2>
            <motion.p className="text-muted-foreground text-center max-w-lg mx-auto" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>Четыре шага до многоуровневого пассивного дохода</motion.p>
          </div>
          <InfiniteMarquee direction="right" speed={50}>
            {steps.map((step, i) => (
              <div key={step.title} className="w-72 shrink-0">
                <Card className="h-full border border-teal-500/10 shadow-lg hover:shadow-xl hover:shadow-teal-500/5 transition-all bg-card/80 backdrop-blur-sm group overflow-hidden">
                  <div className="relative h-40 overflow-hidden">
                    <img src={step.image} alt={step.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute top-3 left-3 w-8 h-8 rounded-full bg-teal-500 text-white text-sm font-bold flex items-center justify-center shadow-lg shadow-teal-500/30">{i + 1}</div>
                  </div>
                  <CardContent className="pt-4 pb-5">
                    <h3 className="font-display text-lg font-semibold mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </InfiniteMarquee>
        </section>

        {/* Benefits */}
        <section className="py-24 relative overflow-hidden bg-gradient-to-b from-secondary/30 via-background to-secondary/30 section-padding">
          <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(hsl(var(--foreground))_1px,transparent_1px)] [background-size:24px_24px]" />
          <FloatingParticles count={10} mode="dots" />
          <div className="container mx-auto px-6 relative mb-10">
            <motion.h2 className="font-display text-3xl lg:text-4xl font-bold text-center" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>Преимущества программы</motion.h2>
          </div>
          <InfiniteMarquee direction="left" speed={45}>
            {benefits.map((b) => (
              <div key={b.title} className="w-80 shrink-0">
                <Card className="h-full border border-teal-500/10 shadow-lg hover:shadow-xl hover:shadow-teal-500/10 transition-all bg-card/80 backdrop-blur-sm group overflow-hidden">
                  <div className="relative h-44 overflow-hidden">
                    <img src={b.image} alt={b.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <CardContent className="pt-4 pb-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500/20 to-cyan-400/10 flex items-center justify-center group-hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-shadow shrink-0"><b.icon className="w-5 h-5 text-teal-600" /></div>
                      <h3 className="font-semibold">{b.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </InfiniteMarquee>
        </section>

        {/* Network Levels */}
        <section className="py-24 relative overflow-hidden section-padding">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(20,184,166,0.06),transparent_60%)]" />
          <div className="container mx-auto px-6 relative">
            <motion.h2 className="font-display text-3xl lg:text-4xl font-bold text-center mb-4" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>Многоуровневая комиссия</motion.h2>
            <motion.p className="text-muted-foreground text-center mb-14 max-w-lg mx-auto" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>Зарабатывайте не только с прямых приглашений, но и со всей вашей сети</motion.p>
            <div className="max-w-3xl mx-auto space-y-4 mb-12">
              {networkLevels.map((row, i) => (
                <motion.div key={row.level} initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}>
                  <div className={`flex items-center justify-between px-6 py-6 rounded-xl bg-gradient-to-r ${row.color} border backdrop-blur-sm hover:scale-[1.02] transition-all duration-300`}>
                    <div><div className="font-semibold text-lg">{row.level}</div><div className="text-sm text-muted-foreground">{row.desc}</div></div>
                    <div className="text-4xl font-bold text-teal-500 drop-shadow-[0_0_8px_rgba(20,184,166,0.3)]">{row.percent}</div>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="max-w-3xl mx-auto grid sm:grid-cols-2 gap-4">
              {bonuses.map((b, i) => (
                <motion.div key={b.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.5 + i * 0.1 }}>
                  <Card className="border-dashed border-2 border-teal-500/15 bg-teal-500/[0.02]">
                    <CardContent className="pt-5 pb-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0"><b.icon className={`w-6 h-6 ${b.color}`} /></div>
                      <div className="flex-1"><div className="font-semibold">{b.title}</div><div className="text-xs text-muted-foreground">{b.condition}</div></div>
                      <div className="text-2xl font-bold text-teal-500">{b.bonus}</div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Case Studies + Calculator */}
        <section className="py-24 relative overflow-hidden bg-foreground section-padding">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_30%,rgba(20,184,166,0.12),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_70%,rgba(6,182,212,0.08),transparent_60%)]" />
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:32px_32px]" />
          <FloatingParticles count={10} mode="dots" />
          <div className="container mx-auto px-6 relative z-10">
            <motion.div className="text-center mb-14" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <Badge className="mb-4 px-3 py-1 bg-teal-500/15 text-teal-300 border-teal-500/30"><BarChart3 className="w-3.5 h-3.5 mr-1" /> Реальные цифры</Badge>
              <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-4">Образец расчёта дохода</h2>
              <p className="text-white/50 max-w-2xl mx-auto">На основе реальных тарифов платформы — от 3 490 до 24 990 ₽/мес</p>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
              {caseStudies.map((cs, i) => (
                <motion.div key={cs.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }}>
                  <Card className={`h-full border bg-gradient-to-b ${cs.color} backdrop-blur-sm hover:scale-[1.02] transition-all duration-300 overflow-hidden`}>
                    <div className="relative h-40 overflow-hidden">
                      <img src={cs.image} alt={cs.title} loading="lazy" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className="absolute bottom-3 left-4 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl ${cs.iconBg} flex items-center justify-center backdrop-blur-sm`}><cs.icon className={`w-5 h-5 ${cs.iconColor}`} /></div>
                        <div><h3 className="font-semibold text-white text-lg leading-tight">{cs.title}</h3><p className="text-xs text-white/50">{cs.subtitle}</p></div>
                      </div>
                    </div>
                    <CardContent className="pt-5 pb-5">
                      <div className="space-y-2 mb-5">
                        {cs.rows.map((row, ri) => (
                          <div key={ri} className="flex justify-between items-start gap-2 text-sm">
                            <span className="text-white/50 leading-tight">{row.label}</span>
                            <span className="text-teal-400 font-semibold whitespace-nowrap">{row.value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-white/10 pt-4 mb-3">
                        <div className="flex justify-between items-center">
                          <span className="text-white/70 font-medium">Итого в месяц:</span>
                          <span className="text-2xl font-bold text-teal-400">{cs.total}</span>
                        </div>
                      </div>
                      <p className="text-xs text-white/35 leading-relaxed">{cs.note}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Calculator */}
            <motion.div className="max-w-3xl mx-auto" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
              <Card className="bg-white/[0.04] border border-teal-500/20 backdrop-blur-sm">
                <CardContent className="pt-6 pb-6">
                  <h3 className="font-display text-xl font-bold text-white mb-6 flex items-center gap-2"><Sparkles className="w-5 h-5 text-teal-400" /> Рассчитайте свой доход</h3>
                  <div className="space-y-6 mb-8">
                    <div>
                      <label className="text-sm text-white/60 mb-3 block">Средний тариф клиентов</label>
                      <div className="flex flex-wrap gap-2">
                        {priceOptions.map(opt => (
                          <button key={opt.value} onClick={() => setCalcAvgPrice(opt.value)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${calcAvgPrice === opt.value ? "bg-teal-500 text-white shadow-[0_0_15px_rgba(20,184,166,0.3)]" : "bg-white/[0.06] text-white/50 hover:bg-white/[0.1] hover:text-white/70 border border-white/[0.06]"}`}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2"><span className="text-white/60">Уровень 1 — ваши прямые клиенты</span><span className="text-teal-400 font-semibold">{calcLevel1}</span></div>
                      <Slider value={[calcLevel1]} onValueChange={v => setCalcLevel1(v[0])} min={1} max={30} step={1} className="[&_[role=slider]]:bg-teal-500 [&_[role=slider]]:border-teal-500 [&_.bg-primary]:bg-teal-500" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2"><span className="text-white/60">Уровень 2 — клиенты ваших партнёров</span><span className="text-cyan-400 font-semibold">{calcLevel2}</span></div>
                      <Slider value={[calcLevel2]} onValueChange={v => setCalcLevel2(v[0])} min={0} max={100} step={1} className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-500 [&_.bg-primary]:bg-cyan-500" />
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2"><span className="text-white/60">Уровень 3 — третье поколение сети</span><span className="text-blue-400 font-semibold">{calcLevel3}</span></div>
                      <Slider value={[calcLevel3]} onValueChange={v => setCalcLevel3(v[0])} min={0} max={200} step={1} className="[&_[role=slider]]:bg-blue-500 [&_[role=slider]]:border-blue-500 [&_.bg-primary]:bg-blue-500" />
                    </div>
                  </div>
                  <div className="bg-white/[0.04] rounded-xl border border-white/[0.06] p-5 space-y-3">
                    <div className="flex justify-between text-sm"><span className="text-white/50">Уровень 1: {calcLevel1} × {formatRub(calcAvgPrice)} × 20%</span><span className="text-teal-400 font-semibold">{formatRub(calcIncome1)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-white/50">Уровень 2: {calcLevel2} × {formatRub(calcAvgPrice)} × 10%</span><span className="text-cyan-400 font-semibold">{formatRub(calcIncome2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-white/50">Уровень 3: {calcLevel3} × {formatRub(calcAvgPrice)} × 5%</span><span className="text-blue-400 font-semibold">{formatRub(calcIncome3)}</span></div>
                    {calcTurnoverBonus > 0 && <div className="flex justify-between text-sm"><span className="text-white/50">Бонус за оборот (+5%)</span><span className="text-emerald-400 font-semibold">+{formatRub(calcTurnoverBonus)}</span></div>}
                    <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                      <span className="text-white/80 font-medium">Ваш доход в месяц:</span>
                      <span className="text-3xl font-bold text-teal-400">{formatRub(calcGrandTotal)}</span>
                    </div>
                    <p className="text-xs text-white/30 pt-1">* Расчёт без учёта лидерского бонуса (+3% для топ-10 партнёров)</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </section>

        {/* Platform stats */}
        <section className="py-20 relative overflow-hidden bg-gradient-to-b from-secondary/30 via-background to-secondary/30 section-padding">
          <div className="container mx-auto px-6 relative">
            <motion.h2 className="font-display text-3xl lg:text-4xl font-bold text-center mb-4" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>Платформа, которая продаёт себя сама</motion.h2>
            <motion.p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>Ваши клиенты остаются, потому что не найдут аналогов</motion.p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {platformStats.map((stat, i) => (
                <motion.div key={stat.label} initial={{ opacity: 0, y: 40, rotateY: -15 }} whileInView={{ opacity: 1, y: 0, rotateY: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12, type: "spring", damping: 15 }} whileHover={{ y: -8, scale: 1.05 }}>
                  <Card className={`text-center border-0 bg-gradient-to-br ${stat.gradient} backdrop-blur-sm hover:shadow-2xl ${stat.glow} transition-all duration-500 overflow-hidden relative group`}>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    <CardContent className="pt-8 pb-7 relative">
                      <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center mx-auto mb-4 shadow-lg ${stat.glow} group-hover:scale-110 transition-transform duration-300`}><stat.icon className={`w-8 h-8 ${stat.iconColor}`} /></div>
                      <div className="text-4xl font-extrabold bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent mb-2">{stat.value}</div>
                      <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Promo materials */}
        <section className="py-24 relative overflow-hidden bg-foreground section-padding">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_50%,rgba(20,184,166,0.1),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(6,182,212,0.08),transparent_60%)]" />
          <div className="absolute inset-0 opacity-[0.03] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:32px_32px]" />
          <FloatingParticles count={12} mode="dots" />
          <div className="container mx-auto px-6 relative z-10">
            <motion.div className="text-center mb-14" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <Badge className="mb-4 px-3 py-1 bg-teal-500/15 text-teal-300 border-teal-500/30"><Star className="w-3.5 h-3.5 mr-1" /> Готовые материалы</Badge>
              <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-white">Рекламные материалы</h2>
              <p className="text-white/50 max-w-lg mx-auto">Скопируйте готовый текст и отправьте — адаптируйте под свою аудиторию</p>
            </motion.div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {promoMaterials.map((item, i) => (
                <motion.div key={item.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}>
                  <Card className="h-full border border-teal-500/15 bg-white/[0.03] backdrop-blur-sm shadow-xl hover:shadow-2xl hover:shadow-teal-500/5 transition-all group hover:border-teal-500/25">
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-teal-500/15 flex items-center justify-center group-hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-shadow"><item.icon className="w-5 h-5 text-teal-400" /></div>
                        <div><h3 className="font-semibold text-white">{item.title}</h3><p className="text-xs text-white/40">{item.sub}</p></div>
                      </div>
                      <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 max-h-48 overflow-y-auto"><p className="text-sm leading-relaxed whitespace-pre-line text-white/60">{item.text}</p></div>
                      <Button size="sm" variant="outline" className="gap-1.5 border-teal-500/20 text-teal-400 hover:bg-teal-500/10 hover:text-teal-300" onClick={() => copyText(item.text)}><Copy className="w-3.5 h-3.5" /> Копировать текст</Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
            <motion.div className="mt-12 max-w-5xl mx-auto" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}>
              <h3 className="font-display text-lg font-semibold mb-4 text-center text-white/80">Дополнительные материалы для скачивания</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                {downloadMaterials.map((file, i) => (
                  <a key={i} href={file.href} download className="flex items-center gap-3 p-4 rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-teal-500/20 transition-all group">
                    <Badge className={`${file.color} border-0 text-xs font-bold px-2 py-0.5`}>{file.type}</Badge>
                    <span className="text-sm flex-1 leading-tight text-white/70 group-hover:text-white/90 transition-colors">{file.name}</span>
                    <Download className="w-4 h-4 text-white/30 group-hover:text-teal-400 transition-colors shrink-0" />
                  </a>
                ))}
              </div>
            </motion.div>
            <motion.div className="mt-20 max-w-4xl mx-auto" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
              <h3 className="font-display text-2xl font-bold text-center mb-8 text-white">Кому рекомендовать</h3>
              <div className="grid sm:grid-cols-3 gap-6">
                {recommendTargets.map((item, i) => (
                  <motion.div key={i} whileHover={{ y: -4 }} transition={{ type: "spring", damping: 20 }}>
                    <Card className="border border-teal-500/15 bg-white/[0.03] backdrop-blur-sm text-center transition-all h-full hover:border-teal-500/25 hover:shadow-[0_0_25px_rgba(20,184,166,0.08)] group">
                      <CardContent className="pt-6 pb-5">
                        <div className="w-14 h-14 rounded-2xl bg-teal-500/15 flex items-center justify-center mx-auto mb-4 group-hover:shadow-[0_0_20px_rgba(20,184,166,0.2)] transition-shadow"><item.icon className="w-7 h-7 text-teal-400" /></div>
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
            <motion.div className="text-center mb-14" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <Badge className="mb-4 px-3 py-1 bg-teal-500/10 text-teal-600 border-teal-500/20"><HelpCircle className="w-3.5 h-3.5 mr-1" /> FAQ</Badge>
              <h2 className="font-display text-3xl lg:text-4xl font-bold">Частые вопросы</h2>
            </motion.div>
            <motion.div className="max-w-3xl mx-auto" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}>
              <Accordion type="single" collapsible className="space-y-3">
                {faqItems.map((item, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="border border-teal-500/10 rounded-xl px-5 data-[state=open]:bg-teal-500/3 backdrop-blur-sm">
                    <AccordionTrigger className="text-left text-sm font-medium hover:no-underline py-4">{item.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-28 relative overflow-hidden bg-foreground">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_50%,rgba(20,184,166,0.12),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_50%,rgba(6,182,212,0.08),transparent_60%)]" />
          <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:32px_32px]" />
          <motion.div className="absolute top-8 left-8 w-24 h-24 border-t-2 border-l-2 border-teal-400/20 rounded-tl-3xl" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.3, duration: 0.8 }} />
          <motion.div className="absolute bottom-8 right-8 w-24 h-24 border-b-2 border-r-2 border-teal-400/20 rounded-br-3xl" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.5, duration: 0.8 }} />
          <FloatingParticles count={8} mode="dots" />
          <div className="container mx-auto px-6 text-center relative z-10">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }}>
              <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-white">Начните зарабатывать до 45% уже сегодня</h2>
              <p className="text-white/50 mb-10 max-w-lg mx-auto text-lg">Регистрация занимает 1 минуту. Стройте сеть партнёров и получайте многоуровневый доход.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {isPartner ? (
                  <Button size="lg" onClick={() => navigate("/partner/dashboard")} className="text-lg px-8 py-6 bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_30px_rgba(20,184,166,0.4)]">Кабинет партнёра <ArrowRight className="w-5 h-5 ml-2" /></Button>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Checkbox id="cta-agree" checked={agreedToTerms} onCheckedChange={(v) => setAgreedToTerms(v === true)} className="border-teal-500/50 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500" />
                      <label htmlFor="cta-agree" className="text-sm text-white/50 cursor-pointer">Я согласен с{" "}<Link to="/partner/offer" className="text-teal-400 underline underline-offset-2 hover:text-teal-300">условиями</Link></label>
                    </div>
                    <Button size="lg" onClick={handleBecomePartner} disabled={isBecoming || !agreedToTerms} className="text-lg px-10 py-7 bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_40px_rgba(20,184,166,0.4)]">
                      <Sparkles className="w-5 h-5 mr-2" /> Стать партнёром <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>
                )}
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
