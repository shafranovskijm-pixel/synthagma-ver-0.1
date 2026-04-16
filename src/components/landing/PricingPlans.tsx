import { useState } from "react";
import { motion } from "framer-motion";
import { Check, X, Crown, Sparkles, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { SUBSCRIPTION_PLANS, YEARLY_DISCOUNT, formatStorageSize, type SubscriptionPlan } from "@/constants/subscriptionPlans";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FloatingParticles } from "./FloatingParticles";
const planOrder: SubscriptionPlan[] = ['free', 'start', 'standard', 'professional', 'maximum'];

const featureDescriptions: Record<string, { description: string; minPlan: string }> = {
  "Настройки курсов": { description: "Запрет перемотки видео, последовательное прохождение уроков, ограничение по времени. Контролируйте процесс обучения.", minPlan: "Бесплатный" },
  "Магазин курсов": { description: "Витрина курсов для самостоятельной записи учеников. Настройте цены и описания.", minPlan: "Бесплатный" },
  "Чек-лист документов": { description: "Автоматический сбор документов от учеников. Настройте список необходимых документов для каждого курса.", minPlan: "Бесплатный" },
  "Видеоидентификация": { description: "Верификация личности ученика через видеозвонок. Соответствие требованиям 273-ФЗ.", minPlan: "Бесплатный" },
  "Брендирование": { description: "Логотип, цвета и домен вашей организации. Ученики видят вашу платформу, а не нашу.", minPlan: "Бесплатный" },
  "Компании": { description: "Управление корпоративными клиентами, договорами и массовым зачислением сотрудников.", minPlan: "Бесплатный" },
  "Журналы": { description: "Автогенерация журналов посещаемости и оценок для лицензированных организаций.", minPlan: "Бесплатный" },
  "Документы для ЛОО": { description: "Автоматическая генерация приказов, протоколов, журналов и договоров для лицензированных образовательных организаций.", minPlan: "Бесплатный" },
  "Охрана труда": { description: "Модуль для организации обучения по охране труда с журналами и протоколами.", minPlan: "Бесплатный" },
  "ФИС ФРДО": { description: "Выгрузка данных в Федеральный реестр документов об образовании. Автоматическое формирование XML.", minPlan: "Бесплатный" },
  "Вебинары": { description: "Проведение онлайн-вебинаров и трансляций с интеграцией Kinescope Live.", minPlan: "Профессиональный" },
  "Видеосервис+": { description: "Загрузка видеофайлов размером более 2 ГБ. Профессиональный видеохостинг с DRM-защитой.", minPlan: "Профессиональный" },
  "3D-тренажёры": { description: "Интерактивные 3D-тренажёры и симуляции для практического обучения.", minPlan: "Максимальный" },
  "ИИ-генерация": { description: "Автоматическое создание курсов, уроков и тестов с помощью искусственного интеллекта.", minPlan: "Бесплатный" },
  "ИИ-озвучка": { description: "Озвучивание текстовых уроков реалистичным голосом с помощью ИИ.", minPlan: "Бесплатный" },
};

const featureRows: { label: string; link?: string; getValue: (p: SubscriptionPlan) => string | boolean }[] = [
  { label: "Курсы", getValue: (p: SubscriptionPlan) => {
    const l = SUBSCRIPTION_PLANS[p].limits;
    return l.maxCourses === -1 ? "Безлимит" : String(l.maxCourses);
  }},
  { label: "Ученики", getValue: (p: SubscriptionPlan) => {
    const l = SUBSCRIPTION_PLANS[p].limits;
    return l.maxStudents === -1 ? "Безлимит" : String(l.maxStudents);
  }},
  { label: "Настройки курсов", link: "/feature/course-settings", getValue: () => true },
  { label: "Магазин курсов", link: "/feature/course-store", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('services') },
  { label: "Чек-лист документов", link: "/feature/document-checklist", getValue: () => true },
  { label: "Видеоидентификация", link: "/feature/video-id", getValue: () => true },
  { label: "Брендирование", link: "/feature/branding", getValue: () => true },
  { label: "Компании", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('companies') },
  { label: "Журналы", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('journals') },
  { label: "Документы для ЛОО", link: "/feature/documents", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('documents') },
  { label: "Охрана труда", link: "/feature/labor-safety", getValue: (p) => SUBSCRIPTION_PLANS[p].enabledCategories.includes('labor_safety') },
  { label: "ФИС ФРДО", link: "/feature/frdo", getValue: (p) => {
    if (!SUBSCRIPTION_PLANS[p].enabledCategories.includes('frdo')) return false;
    return (p === 'professional' || p === 'maximum') ? 'ФРДО+' : true;
  }},
  { label: "Вебинары", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.webinarsEnabled },
  { label: "Видеосервис+", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.videoServicePlus },
  { label: "3D-тренажёры", getValue: (p) => SUBSCRIPTION_PLANS[p].limits.trainersEnabled },
  { label: "ИИ-генерация", link: "/feature/ai-courses", getValue: () => true },
  { label: "ИИ-озвучка", link: "/feature/ai-courses", getValue: () => true },
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
      {/* Floating particles */}
      <FloatingParticles mode="dots" count={10} />

      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/20 to-background" />
      <div className="absolute inset-0 opacity-[0.012]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px'
      }} />

      {/* Decor: blur spots */}
      <div className="absolute top-[8%] left-[3%] w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[10%] right-[5%] w-72 h-72 bg-accent/4 rounded-full blur-3xl pointer-events-none" />

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

      {/* Decor: diamonds */}
      <motion.div
        className="absolute top-[40%] left-[4%] w-4 h-4 rotate-45 border border-accent/20"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.8 }}
      />
      <motion.div
        className="absolute bottom-[30%] right-[6%] w-3 h-3 rotate-45 bg-accent/10"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1 }}
      />

      {/* Decor: circles */}
      <motion.div
        className="absolute top-[25%] right-[12%] w-2.5 h-2.5 rounded-full bg-accent/30"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.9 }}
      />
      <motion.div
        className="absolute bottom-[40%] left-[10%] w-2 h-2 rounded-full border border-accent/25"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 1.1 }}
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
                        const isAccent = typeof val === 'string' && val === 'ФРДО+' || row.label === 'Вебинары' || row.label === 'Видеосервис+' || row.label === '3D-тренажёры';
                        const displayLabel = val === 'ФРДО+' ? 'ФИС ФРДО+' : row.label;
                        const isEnabled = isBool ? val : true;
                        return (
                          <div key={row.label} className="flex items-center gap-2 text-sm">
                            {isBool ? (
                              val ? (
                                <Check className={`w-4 h-4 shrink-0 ${isAccent && val ? 'text-[hsl(38,92%,50%)]' : 'text-accent'}`} />
                              ) : (
                                <X className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                              )
                            ) : typeof val === 'string' && (val === 'ФРДО+') ? (
                              <Check className="w-4 h-4 text-[hsl(38,92%,50%)] shrink-0" />
                            ) : (
                              <span className="min-w-5 text-center text-xs font-semibold text-accent shrink-0">
                                {val === 'Безлимит' ? '∞' : val}
                              </span>
                            )}
                            {featureDescriptions[row.label] ? (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button className={`inline-flex items-center gap-1 text-left decoration-dotted underline-offset-2 hover:underline hover:text-accent transition-colors ${!isEnabled ? 'text-muted-foreground/50' : isAccent && isEnabled ? 'text-[hsl(38,92%,50%)] font-semibold' : 'text-foreground/80'}`}>
                                    {displayLabel}
                                    <Info className="w-3 h-3 text-muted-foreground shrink-0" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent side="top" className="w-72 text-sm">
                                  <div className="space-y-2">
                                    <p className="font-semibold">{displayLabel}</p>
                                    <p className="text-muted-foreground text-xs leading-relaxed">{featureDescriptions[row.label].description}</p>
                                    <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                                      от тарифа «{featureDescriptions[row.label].minPlan}»
                                    </span>
                                    {row.link && (
                                      <Link to={row.link} className="block text-xs text-accent hover:underline mt-1">
                                        Подробнее →
                                      </Link>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            ) : (
                              <span className={!isEnabled ? 'text-muted-foreground/50' : isAccent && isEnabled ? 'text-[hsl(38,92%,50%)] font-semibold' : 'text-foreground/80'}>
                                {displayLabel}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* CTA */}
                    <Link
                      to={`/register-organization?plan=${planId}`}
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

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="text-center text-sm text-muted-foreground mt-4 flex flex-col items-center gap-2"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accent" />
            Все тарифы включают бесплатную техническую поддержку
          </span>
          <span className="text-xs text-[hsl(38,92%,50%)]/80">
            ФИС ФРДО+ — выгрузка данных в реестр выполняется нами за вас
          </span>
        </motion.p>
      </div>
    </section>
  );
}
