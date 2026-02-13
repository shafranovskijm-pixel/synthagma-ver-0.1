import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Crown, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT, formatStorageSize, type SubscriptionPlan } from "@/constants/subscriptionPlans";

const planOrder: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

const featureRows = [
  { label: "Курсы", getValue: (p: SubscriptionPlan) => {
    const l = SUBSCRIPTION_PLANS[p].limits;
    return l.maxCourses === -1 ? "Безлимит" : String(l.maxCourses);
  }},
  { label: "Ученики", getValue: (p: SubscriptionPlan) => {
    const l = SUBSCRIPTION_PLANS[p].limits;
    return l.maxStudents === -1 ? "Безлимит" : String(l.maxStudents);
  }},
  { label: "Обученных/мес", getValue: (p: SubscriptionPlan) => {
    const l = SUBSCRIPTION_PLANS[p].limits;
    return l.maxTrainedPerMonth === -1 ? "Безлимит" : String(l.maxTrainedPerMonth);
  }},
  { label: "Хранилище", getValue: (p: SubscriptionPlan) => formatStorageSize(SUBSCRIPTION_PLANS[p].limits.storageBytes) },
  { label: "Настройки курсов", getValue: (p: SubscriptionPlan) => SUBSCRIPTION_PLANS[p].limits.courseSettings ? true : false },
  { label: "Чек-лист документов", getValue: (p: SubscriptionPlan) => SUBSCRIPTION_PLANS[p].limits.documentChecklist ? true : false },
  { label: "Видеоидентификация", getValue: (p: SubscriptionPlan) => SUBSCRIPTION_PLANS[p].limits.videoIdentification ? true : false },
  { label: "Документы для ЛОО", getValue: (p: SubscriptionPlan) => (p === 'professional' || p === 'maximum') ? true : false },
  { label: "ФИС ФРДО", getValue: (p: SubscriptionPlan) => (p === 'professional' || p === 'maximum') ? true : false },
  { label: "Отчеты 1-ПК / 1-ПО", getValue: (p: SubscriptionPlan) => (p === 'professional' || p === 'maximum') ? true : false },
  { label: "ИИ-генерация", getValue: (p: SubscriptionPlan) => SUBSCRIPTION_PLANS[p].limits.aiEnabled ? true : false },
  { label: "ИИ-озвучка", getValue: (p: SubscriptionPlan) => SUBSCRIPTION_PLANS[p].limits.aiAudioEnabled ? true : false },
];

function formatPrice(price: number): string {
  return price.toLocaleString('ru-RU');
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

export function PricingPlans() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <section id="pricing" className="section-padding relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/20 to-background" />
      <div className="absolute inset-0 opacity-[0.012]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px'
      }} />

      {/* Decorative elements */}
      <motion.div
        className="absolute top-[15%] right-0 w-px h-48 bg-gradient-to-b from-transparent via-accent/20 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div
        className="absolute bottom-[20%] left-0 w-px h-32 bg-gradient-to-b from-transparent via-border to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.2 }}
      />
      <motion.div
        className="absolute top-20 left-8 w-12 h-12 border-l border-t border-accent/15 rounded-tl-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.5 }}
      />
      <motion.div
        className="absolute bottom-20 right-8 w-12 h-12 border-r border-b border-accent/15 rounded-br-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.6 }}
      />

      <div className="container mx-auto px-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
            Тарифы
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
            Выберите свой план
          </h2>
          <div className="divider mb-6" />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Начните бесплатно и масштабируйтесь по мере роста
          </p>
        </motion.div>

        {/* Billing toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex items-center justify-center gap-4 mb-16"
        >
          <span className={`text-sm font-medium transition-colors ${!isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
            Помесячно
          </span>
          <button
            onClick={() => setIsYearly(!isYearly)}
            className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${
              isYearly ? 'bg-accent' : 'bg-border'
            }`}
          >
            <div className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-background shadow-md transition-transform duration-300 ${
              isYearly ? 'translate-x-7' : 'translate-x-0'
            }`} />
          </button>
          <span className={`text-sm font-medium transition-colors ${isYearly ? 'text-foreground' : 'text-muted-foreground'}`}>
            За год
          </span>
          {isYearly && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-xs font-semibold text-accent bg-accent/10 px-2.5 py-1 rounded-full"
            >
              −{YEARLY_DISCOUNT * 100}%
            </motion.span>
          )}
        </motion.div>

        {/* Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 xl:gap-5"
        >
          {planOrder.map((planId) => {
            const plan = SUBSCRIPTION_PLANS[planId];
            const isRecommended = planId === 'standard';
            const isFree = planId === 'free';
            const monthlyPrice = plan.price;
            const displayPrice = isYearly && !isFree
              ? Math.round(monthlyPrice * (1 - YEARLY_DISCOUNT))
              : monthlyPrice;

            return (
              <motion.div
                key={planId}
                variants={cardVariants}
                className={`relative rounded-2xl p-[1px] group ${isRecommended ? 'lg:-mt-4 lg:mb-[-16px]' : ''}`}
              >
                {/* Border gradient */}
                <div className={`absolute inset-0 rounded-2xl transition-all duration-500 ${
                  isRecommended
                    ? 'bg-gradient-to-b from-accent via-accent/40 to-accent/20'
                    : 'bg-border/50 group-hover:bg-border'
                }`} />

                {/* Recommended badge */}
                {isRecommended && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20">
                    <div className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold bg-accent text-foreground shadow-lg">
                      <Crown className="w-3.5 h-3.5" />
                      Рекомендуем
                    </div>
                  </div>
                )}

                {/* Card body */}
                <div className={`relative rounded-2xl p-6 h-full flex flex-col ${
                  isRecommended
                    ? 'bg-card/95 backdrop-blur-xl'
                    : 'bg-card/80 backdrop-blur-md'
                }`}>
                  {/* Inner glow for recommended */}
                  {isRecommended && (
                    <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-accent/10 blur-3xl" />
                    </div>
                  )}

                  <div className="relative z-10 flex flex-col h-full">
                    {/* Plan name */}
                    <div className="mb-4">
                      <h3 className={`font-display text-lg font-medium mb-1 ${
                        isRecommended ? 'gradient-text-gold' : ''
                      }`}>
                        {plan.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">{plan.description}</p>
                    </div>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-3xl font-medium tracking-tight">
                          {isFree ? '0' : formatPrice(displayPrice)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {isFree ? '₽' : '₽/мес'}
                        </span>
                      </div>
                      {isYearly && !isFree && (
                        <div className="mt-1 text-xs text-muted-foreground line-through">
                          {formatPrice(monthlyPrice)} ₽/мес
                        </div>
                      )}
                    </div>

                    {/* Features */}
                    <div className="space-y-2.5 mb-6 flex-1">
                      {featureRows.map((row) => {
                        const val = row.getValue(planId);
                        const isBool = typeof val === 'boolean';
                        return (
                          <div key={row.label} className="flex items-center gap-2 text-sm">
                            {isBool ? (
                              val ? (
                                <Check className="w-4 h-4 text-accent shrink-0" />
                              ) : (
                                <X className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                              )
                            ) : (
                              <span className="w-4 text-center text-xs font-semibold text-accent shrink-0">
                                {val === 'Безлимит' ? '∞' : val}
                              </span>
                            )}
                            <span className={isBool && !val ? 'text-muted-foreground/50' : 'text-foreground/80'}>
                              {row.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* CTA */}
                    <Link
                      to="/register-organization"
                      className={`block w-full text-center py-3 rounded-xl text-sm font-medium transition-all duration-300 ${
                        isRecommended
                          ? 'btn-accent shadow-md hover:shadow-lg'
                          : isFree
                          ? 'bg-foreground text-background hover:bg-foreground/90'
                          : 'border border-border hover:border-accent/50 hover:bg-accent/5 text-foreground'
                      }`}
                    >
                      {isFree ? 'Начать бесплатно' : 'Подключить'}
                    </Link>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Licensed org note */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-10 max-w-3xl mx-auto text-center"
        >
          <p className="text-sm text-muted-foreground leading-relaxed flex items-start justify-center gap-2">
            <Crown className="w-4 h-4 text-accent shrink-0 mt-0.5" />
            Тарифы «Профессиональный» и «Максимальный» ориентированы на лицензированные учебные центры для упрощения ведения обязательной документации, отчётности ФИС ФРДО и статистических форм 1-ПК / 1-ПО.
          </p>
        </motion.div>

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="text-center text-sm text-muted-foreground mt-4 flex items-center justify-center gap-1.5"
        >
          <Sparkles className="w-4 h-4 text-accent" />
          Все тарифы включают бесплатную техническую поддержку
        </motion.p>
      </div>
    </section>
  );
}
