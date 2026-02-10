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
  Download,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { InlineEditable } from "./InlineEditable";

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
      
      {/* Pattern overlay */}
      <div className="absolute inset-0 opacity-[0.012]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px'
      }} />
      
      {/* Decorative elements */}
      <motion.div 
        className="absolute top-1/4 right-0 w-px h-48 bg-gradient-to-b from-transparent via-accent/20 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div 
        className="absolute bottom-1/3 left-0 w-px h-32 bg-gradient-to-b from-transparent via-border to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.2 }}
      />
      <motion.div 
        className="absolute top-[15%] left-[5%] w-px h-24 bg-gradient-to-b from-transparent via-accent/25 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.3 }}
      />
      <motion.div 
        className="absolute top-[40%] right-[3%] w-px h-36 bg-gradient-to-b from-transparent via-accent/15 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.4 }}
      />
      
      {/* Horizontal decorative lines */}
      <motion.div 
        className="absolute top-[20%] left-[10%] w-20 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.5 }}
      />
      <motion.div 
        className="absolute bottom-[25%] right-[8%] w-16 h-px bg-gradient-to-r from-transparent via-border to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.6 }}
      />
      
      {/* Decorative circles */}
      <motion.div
        className="absolute top-[18%] right-[12%] w-2 h-2 rounded-full border border-accent/25"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.7 }}
      />
      <motion.div
        className="absolute bottom-[30%] left-[15%] w-1.5 h-1.5 rounded-full bg-accent/30"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.8 }}
      />
      <motion.div
        className="absolute top-[50%] left-[3%] w-2.5 h-2.5 rounded-full border border-border"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.9 }}
      />
      
      {/* Corner decorations */}
      <motion.div
        className="absolute top-20 left-8 w-12 h-12 border-l border-t border-accent/15 rounded-tl-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1 }}
      />
      <motion.div
        className="absolute bottom-20 right-8 w-12 h-12 border-r border-b border-accent/15 rounded-br-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1.1 }}
      />
      
      {/* Floating diamonds */}
      <motion.div
        className="absolute top-[35%] left-[20%] w-3 h-3 rotate-45 border border-accent/20"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1.2 }}
      />
      <motion.div
        className="absolute bottom-[40%] right-[18%] w-2.5 h-2.5 rotate-45 bg-accent/10"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1.3 }}
      />

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
          <InlineEditable contentKey="features_title" defaultValue="Всё для обучения">
            {(v) => <h2 className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">{v}</h2>}
          </InlineEditable>
          <div className="divider mb-6" />
          <InlineEditable contentKey="features_subtitle" defaultValue="Полный набор инструментов для дистанционного обучения и документооборота">
            {(v) => <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{v}</p>}
          </InlineEditable>
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
                y: -12,
                rotateX: 5,
                rotateY: index % 3 === 0 ? -3 : index % 3 === 2 ? 3 : 0,
                transition: { duration: 0.4, ease: "easeOut" }
              }}
              className="group relative rounded-2xl p-[1px] cursor-pointer"
              style={{ perspective: '1000px' }}
            >
              {/* Animated gradient border */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-border/50 via-border/20 to-border/50 group-hover:from-accent/60 group-hover:via-accent/20 group-hover:to-accent/60 transition-all duration-700" />
              
              {/* Shimmer effect */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out" />
              </div>
              
              {/* Card content */}
              <div className="relative bg-card/95 backdrop-blur-md rounded-2xl p-8 h-full transition-all duration-500 group-hover:bg-card">
                {/* Inner glow */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none overflow-hidden">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-accent/20 blur-3xl" />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-16 bg-accent/10 blur-2xl" />
                </div>
                
                {/* Floating particles */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                  <motion.div 
                    className="absolute top-6 right-8 w-1 h-1 rounded-full bg-accent/50"
                    animate={{ y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.div 
                    className="absolute top-12 right-12 w-0.5 h-0.5 rounded-full bg-accent/40"
                    animate={{ y: [0, -6, 0], opacity: [0.3, 0.8, 0.3] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                  />
                  <motion.div 
                    className="absolute bottom-8 left-10 w-1 h-1 rounded-full bg-accent/30"
                    animate={{ y: [0, -10, 0], opacity: [0.2, 0.6, 0.2] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  />
                </div>
                
                {/* Corner decoration */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:translate-x-0 group-hover:translate-y-0 translate-x-2 -translate-y-2">
                  <div className="w-6 h-6 border-t-2 border-r-2 border-accent/40 rounded-tr-lg" />
                </div>
                <div className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-all duration-500 transform group-hover:translate-x-0 group-hover:translate-y-0 -translate-x-2 translate-y-2">
                  <div className="w-6 h-6 border-b-2 border-l-2 border-accent/40 rounded-bl-lg" />
                </div>
                
                <div className="relative z-10">
                  {/* Icon with pulse effect */}
                  <div className="relative mb-6">
                    <motion.div 
                      className="w-14 h-14 rounded-xl bg-gradient-to-br from-secondary to-secondary/50 flex items-center justify-center border border-border/50 group-hover:border-accent/40 group-hover:from-accent/20 group-hover:to-accent/5 transition-all duration-500 shadow-sm group-hover:shadow-lg group-hover:shadow-accent/10"
                      whileHover={{ 
                        scale: 1.1,
                        rotate: 5,
                        transition: { duration: 0.3 }
                      }}
                    >
                      <feature.icon className="w-6 h-6 text-foreground/60 group-hover:text-accent transition-colors duration-300" />
                    </motion.div>
                    {/* Icon glow ring */}
                    <div className="absolute inset-0 w-14 h-14 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <div className="absolute inset-0 rounded-xl bg-accent/20 blur-md animate-pulse" />
                    </div>
                  </div>
                  
                  <h3 className="font-display text-xl font-medium mb-3 group-hover:text-foreground transition-colors duration-300">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed text-sm group-hover:text-foreground/70 transition-colors duration-300">
                    {feature.description}
                  </p>
                  
                  {/* Bottom accent line */}
                  <div className="mt-6 h-0.5 w-0 group-hover:w-12 bg-gradient-to-r from-accent to-accent/30 rounded-full transition-all duration-500 ease-out" />
                </div>
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

            {/* Install app button */}
            <Link
              to="/install"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              <Download className="w-5 h-5" />
              <span className="text-sm font-medium">Установить приложение</span>
            </Link>
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
