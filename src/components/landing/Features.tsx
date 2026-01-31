import {
  BookOpen,
  Users,
  Building2,
  FileCheck,
  ClipboardList,
  Database,
  GraduationCap,
  Smartphone,
  Bell,
  MessageCircle,
  Volume2,
} from "lucide-react";
import { motion } from "framer-motion";

const features = [
  {
    icon: BookOpen,
    title: "Управление курсами",
    description: "Современный редактор с ИИ для создания интерактивных курсов. Импорт с любых платформ.",
  },
  {
    icon: Users,
    title: "Слушатели",
    description: "Массовый импорт, автоматическая рассылка логинов. Сбор документов через личный кабинет.",
  },
  {
    icon: Building2,
    title: "Компании",
    description: "Привязка групп к компаниям. Уникальные ссылки для регистрации. Хранение договоров.",
  },
  {
    icon: FileCheck,
    title: "Документооборот",
    description: "Автоматическое создание договоров, счетов, актов. Сбор согласий и приказы.",
  },
  {
    icon: ClipboardList,
    title: "Журналы",
    description: "Посещаемость, оценки, протоколы аттестации. Экспорт в Excel одним кликом.",
  },
  {
    icon: Database,
    title: "ФРДО",
    description: "Автоматическое формирование выгрузки. Готовность к интеграции с ЕР ЦРДО.",
  },
];

const mobileFeatures = [
  { icon: BookOpen, text: "Курсы офлайн" },
  { icon: Bell, text: "Уведомления" },
  { icon: MessageCircle, text: "Чат с куратором" },
  { icon: Volume2, text: "Озвучка лекций" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

export function Features() {
  return (
    <section id="features" className="section-padding relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/30 to-background" />
      
      {/* Decorative elements */}
      <div className="absolute top-1/4 right-0 w-px h-48 bg-gradient-to-b from-transparent via-accent/20 to-transparent" />
      <div className="absolute bottom-1/3 left-0 w-px h-32 bg-gradient-to-b from-transparent via-border to-transparent" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
            Возможности
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
            Всё для обучения
          </h2>
          <div className="divider mb-6" />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Полный набор инструментов для дистанционного обучения и документооборота
          </p>
        </motion.div>

        {/* Features grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-32"
        >
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              whileHover={{ 
                y: -8, 
                scale: 1.02,
                transition: { duration: 0.3, ease: "easeOut" }
              }}
              className="group relative bg-card/60 backdrop-blur-sm rounded-2xl p-8 border border-border/40 transition-all duration-500 cursor-pointer overflow-hidden"
              style={{
                boxShadow: '0 4px 20px -4px rgba(0, 0, 0, 0.05)'
              }}
            >
              {/* Glow effect on hover */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-accent/5" />
                <div className="absolute -inset-1 bg-accent/5 blur-xl" />
              </div>
              
              {/* Accent border glow */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" 
                style={{
                  boxShadow: 'inset 0 0 0 1px hsl(var(--accent) / 0.3), 0 8px 32px -8px hsl(var(--accent) / 0.2)'
                }}
              />
              
              {/* Corner accent */}
              <div className="absolute top-0 right-0 w-20 h-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                <div className="absolute top-4 right-4 w-8 h-8 border-t border-r border-accent/30 rounded-tr-xl" />
              </div>
              
              <div className="relative z-10">
                <motion.div 
                  className="w-14 h-14 rounded-xl bg-secondary/80 flex items-center justify-center mb-6 border border-border/30 group-hover:bg-accent/15 group-hover:border-accent/30 transition-all duration-300"
                  whileHover={{ rotate: [0, -5, 5, 0], transition: { duration: 0.5 } }}
                >
                  <feature.icon className="w-6 h-6 text-foreground/70 group-hover:text-accent transition-colors duration-300" />
                </motion.div>
                
                <h3 className="font-display text-xl font-medium mb-3 group-hover:text-foreground transition-colors">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed text-sm group-hover:text-foreground/70 transition-colors">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Mobile App Section */}
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="order-2 lg:order-1"
          >
            <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
              Мобильное приложение
            </span>
            <h3 className="font-display text-3xl md:text-4xl font-medium mb-6 tracking-tight">
              Обучение в кармане
            </h3>
            <div className="w-12 h-px bg-accent mb-6" />
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Ученики могут проходить курсы где угодно. 
              Приложение синхронизируется с веб-версией в реальном времени.
            </p>
            
            {/* Mobile features */}
            <div className="flex flex-wrap gap-3 mb-8">
              {mobileFeatures.map((feature) => (
                <div
                  key={feature.text}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 border border-border/30"
                >
                  <feature.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{feature.text}</span>
                </div>
              ))}
            </div>

            {/* App store badges */}
            <div className="flex gap-3">
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background cursor-pointer hover:bg-foreground/90 transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] opacity-70">Скачать в</div>
                  <div className="text-xs font-medium -mt-0.5">App Store</div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background cursor-pointer hover:bg-foreground/90 transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/>
                </svg>
                <div className="text-left">
                  <div className="text-[10px] opacity-70">Скачать в</div>
                  <div className="text-xs font-medium -mt-0.5">Google Play</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Phone mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="order-1 lg:order-2 flex justify-center"
          >
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-accent/10 rounded-[3rem] blur-3xl scale-90" />
              
              {/* Phone frame */}
              <div className="relative w-[280px] bg-foreground rounded-[3rem] p-3 shadow-2xl">
                {/* Screen */}
                <div className="bg-background rounded-[2.5rem] overflow-hidden aspect-[9/19]">
                  {/* Status bar */}
                  <div className="h-7 bg-secondary flex items-center justify-center">
                    <div className="w-20 h-4 bg-foreground/10 rounded-full" />
                  </div>
                  
                  {/* App content */}
                  <div className="p-4 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Добро пожаловать</div>
                        <div className="font-medium text-xs">Иван Петров</div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-accent/20" />
                    </div>
                    
                    {/* Progress card */}
                    <div className="bg-secondary/50 rounded-xl p-3 border border-border/30">
                      <div className="text-[10px] text-muted-foreground mb-1">Прогресс</div>
                      <div className="font-medium text-sm mb-2">78%</div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full w-[78%] bg-accent rounded-full" />
                      </div>
                    </div>
                    
                    {/* Course cards */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium">Мои курсы</div>
                      {[
                        { title: "Охрана труда", progress: 100 },
                        { title: "Пожарная безопасность", progress: 65 },
                        { title: "Электробезопасность", progress: 30 },
                      ].map((course) => (
                        <div key={course.title} className="bg-card rounded-lg p-2.5 border border-border/30">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                              <GraduationCap className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[10px] truncate">{course.title}</div>
                              <div className="text-[10px] text-muted-foreground">{course.progress}%</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
