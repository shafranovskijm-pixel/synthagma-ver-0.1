import {
  Upload,
  Brain,
  Users,
  Building2,
  FileCheck,
  ClipboardList,
  Database,
  ShoppingBag,
  GraduationCap,
  Smartphone,
  BookOpen,
  MessageCircle,
  Bell,
  Volume2,
  FileSpreadsheet,
  Send,
  Link as LinkIcon
} from "lucide-react";
import { ScrollReveal, ScrollRevealGroup, scrollRevealItem } from "@/components/ui/ScrollReveal";
import { motion } from "framer-motion";

const features = [
  {
    icon: BookOpen,
    title: "Управление курсами",
    description: "Современный редактор вместе с ИИ поможет превратить даже скучную лекцию в удобный и интерактивный формат. Удобный импорт с других платформ",
    glyph: "𓂀",
  },
  {
    icon: Users,
    title: "Слушатели",
    description: "Импортируй большими файлами, автоматическая рассылка логинов. Получай документы: СНИЛС, документ об образовании, паспорт. Отправляй напоминания",
    glyph: "𓃀",
  },
  {
    icon: Building2,
    title: "Компании",
    description: "Создавайте ссылки и привязывайте группы учеников к компании. Храните договоры, счета, акты в одном месте",
    glyph: "𓅀",
  },
  {
    icon: FileCheck,
    title: "Документооборот",
    description: "Автоматическое создание договоров, счетов, актов. Сбор согласий на обработку ПД, журналы выдачи документов, приказы о зачислении/отчислении",
    glyph: "𓆀",
  },
  {
    icon: ClipboardList,
    title: "Журналы",
    description: "Все ваши журналы в одном месте с возможностью выгрузки в Excel. Журналы посещаемости, оценок, выдачи документов",
    glyph: "𓇀",
  },
  {
    icon: Database,
    title: "ФРДО",
    description: "Устали вносить вручную? Система заполнит за вас. Готовы к интеграции с ЕР ЦРДО",
    glyph: "𓈀",
  },
  {
    icon: ShoppingBag,
    title: "Магазин курсов",
    description: "Продавайте свои курсы или закажите готовую программу. Вам не нужен методист",
    glyph: "𓉀",
  },
  {
    icon: GraduationCap,
    title: "Кабинет слушателя",
    description: "ИИ-помощник проконсультирует учеников, озвучивание лекций, удобное прохождение курсов",
    glyph: "𓊀",
  },
];

const mobileFeatures = [
  { icon: BookOpen, text: "Курсы офлайн" },
  { icon: Bell, text: "Push-уведомления" },
  { icon: MessageCircle, text: "Чат с куратором" },
  { icon: Volume2, text: "Озвучка лекций" },
];

export function Features() {
  return (
    <section id="features" className="py-32 relative overflow-hidden bg-gradient-to-b from-background via-secondary/20 to-background">
      {/* Decorative hieroglyphs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <span className="hieroglyphic absolute top-20 left-10 text-5xl text-accent animate-pulse-soft">𓊀</span>
        <span className="hieroglyphic absolute top-1/3 right-16 text-4xl text-primary/20 animate-pulse-soft delay-200">𓉀</span>
        <span className="hieroglyphic absolute bottom-40 left-1/4 text-6xl text-accent/30 animate-pulse-soft delay-300">𓁀</span>
        <span className="greek-text absolute top-1/2 left-8 text-sm text-primary/20 rotate-90">ΠΑΙΔΕΙΑ</span>
        <span className="greek-text absolute bottom-20 right-1/4 text-xs text-primary/30">ΣΟΦΙΑ</span>
      </div>
      
      {/* Cold nitrogen gradient orbs */}
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-gradient-to-br from-primary/10 via-[hsl(185_100%_45%/0.08)] to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-accent/10 via-[hsl(38_85%_40%/0.05)] to-transparent rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative">
        {/* Section header */}
        <ScrollReveal className="text-center mb-20">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-accent/15 to-primary/10 border border-accent/30 mb-8 backdrop-blur-sm">
            <span className="hieroglyphic text-accent text-lg">𓂀</span>
            <span className="text-sm font-semibold text-foreground">Возможности платформы</span>
            <span className="hieroglyphic text-accent text-lg">𓃀</span>
          </div>
          <h2 className="font-display text-4xl md:text-6xl font-bold mb-6 tracking-tight">
            Обучение и <span className="gradient-text-gold">документооборот</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Мощные инструменты для дистанционного обучения, документооборота организации и аналитики
          </p>
          
          {/* Egyptian border decoration */}
          <div className="egyptian-border w-32 mx-auto mt-8 rounded-full" />
        </ScrollReveal>

        {/* Features grid */}
        <ScrollRevealGroup className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24" staggerDelay={0.1}>
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              variants={scrollRevealItem}
              className="relative group bg-card/80 backdrop-blur-sm rounded-3xl p-8 border border-primary/10 hover:border-accent/40 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 overflow-hidden"
            >
              {/* Hieroglyph watermark */}
              <span className="hieroglyphic absolute top-4 right-4 text-3xl text-accent/20 group-hover:text-accent/40 transition-colors">
                {feature.glyph}
              </span>
              
              {/* Icon with cold nitrogen gradient */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary via-[hsl(185_100%_45%)] to-accent flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl sigma-glow">
                <feature.icon className="w-8 h-8 text-foreground" />
              </div>
              
              <h3 className="font-display text-xl font-bold mb-3">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
              
              {/* Gold bottom accent on hover */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
          ))}
        </ScrollRevealGroup>

        {/* Mobile App Section */}
        <div className="relative">
          {/* Egyptian border top */}
          <div className="egyptian-border w-1/3 mx-auto mb-12 rounded-full" />
          
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Content */}
            <ScrollReveal direction="left" className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-gradient-to-r from-primary/15 to-accent/10 border border-primary/30 mb-6">
                <Smartphone className="w-5 h-5 text-primary" />
                <span className="text-sm font-semibold text-foreground">Мобильное приложение</span>
                <span className="hieroglyphic text-accent/60 text-sm">𓅀</span>
              </div>
              <h3 className="font-display text-3xl md:text-4xl font-bold mb-6">
                Обучение <span className="gradient-text">в кармане</span>
              </h3>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Ученики могут проходить курсы где угодно — в дороге, дома или на работе. 
                Приложение синхронизируется с веб-версией в реальном времени.
              </p>
              
              {/* Mobile features */}
              <div className="flex flex-wrap gap-3 mb-8">
                {mobileFeatures.map((feature) => (
                  <div
                    key={feature.text}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card/80 border border-primary/20 shadow-sm hover:border-accent/40 transition-colors"
                  >
                    <feature.icon className="w-5 h-5 text-primary" />
                    <span className="font-medium text-sm">{feature.text}</span>
                  </div>
                ))}
              </div>

              {/* App store badges */}
              <div className="flex gap-4">
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-foreground text-background cursor-pointer hover:opacity-90 transition-opacity">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <div>
                    <div className="text-xs opacity-80">Скачать в</div>
                    <div className="font-semibold text-sm">App Store</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-foreground text-background cursor-pointer hover:opacity-90 transition-opacity">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/>
                  </svg>
                  <div>
                    <div className="text-xs opacity-80">Скачать в</div>
                    <div className="font-semibold text-sm">Google Play</div>
                  </div>
                </div>
              </div>
            </ScrollReveal>

            {/* Phone mockup */}
            <ScrollReveal direction="right" className="order-1 lg:order-2 flex justify-center">
              <div className="relative">
                {/* Glow effect - cold nitrogen */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-[hsl(185_100%_45%/0.2)] to-accent/20 rounded-[3rem] blur-3xl scale-90" />
                
                {/* Phone frame */}
                <div className="relative w-[280px] md:w-[320px] bg-foreground rounded-[3rem] p-3 shadow-2xl">
                  {/* Corner hieroglyphs */}
                  <span className="hieroglyphic absolute -top-6 -left-6 text-3xl text-accent/40">𓊀</span>
                  <span className="hieroglyphic absolute -top-6 -right-6 text-3xl text-accent/40">𓊁</span>
                  
                  {/* Screen */}
                  <div className="bg-background rounded-[2.5rem] overflow-hidden aspect-[9/19]">
                    {/* Status bar with gradient */}
                    <div className="h-8 bg-gradient-to-r from-primary via-[hsl(185_100%_45%)] to-accent flex items-center justify-center">
                      <div className="w-20 h-5 bg-foreground/20 rounded-full" />
                    </div>
                    
                    {/* App content mockup */}
                    <div className="p-4 space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">Добро пожаловать</div>
                          <div className="font-bold text-sm">Иван Петров</div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary via-[hsl(185_100%_45%)] to-accent" />
                      </div>
                      
                      {/* Progress card */}
                      <div className="bg-gradient-to-br from-primary/10 via-[hsl(185_100%_45%/0.08)] to-accent/10 rounded-2xl p-4 border border-primary/20">
                        <div className="text-xs text-muted-foreground mb-1">Ваш прогресс</div>
                        <div className="font-bold text-lg mb-2">78%</div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full w-[78%] bg-gradient-to-r from-primary via-[hsl(185_100%_45%)] to-accent rounded-full" />
                        </div>
                      </div>
                      
                      {/* Course cards */}
                      <div className="space-y-3">
                        <div className="text-sm font-semibold">Мои курсы</div>
                        {[
                          { title: "Охрана труда", progress: 100, glyph: "𓂀" },
                          { title: "Пожарная безопасность", progress: 65, glyph: "𓃀" },
                          { title: "Электробезопасность", progress: 30, glyph: "𓅀" },
                        ].map((course) => (
                          <div key={course.title} className="bg-card rounded-xl p-3 border border-primary/10 relative">
                            <span className="hieroglyphic absolute top-2 right-2 text-sm text-accent/30">{course.glyph}</span>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                                <BookOpen className="w-5 h-5 text-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs truncate">{course.title}</div>
                                <div className="text-xs text-muted-foreground">{course.progress}%</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </div>
          
          {/* Greek text decoration */}
          <div className="greek-text text-center mt-12 text-primary/20 text-sm tracking-[0.5em]">
            ΜΑΘΗΣΙΣ • ΤΕΧΝΗ • ΑΡΕΤΗ
          </div>
        </div>
      </div>
    </section>
  );
}