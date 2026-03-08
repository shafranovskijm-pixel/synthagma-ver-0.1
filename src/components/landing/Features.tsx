import {
  BookOpen,
  Users,
  Building2,
  FileCheck,
  ClipboardList,
  Database,
  Settings,
  ShoppingCart,
  FileSearch,
  Video,
  HardHat,
  Smartphone,
  Bell,
  MessageCircle,
  Volume2,
  Download,
  ArrowRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";


const features: { icon: any; title: string; description: string; link?: string }[] = [
  {
    icon: BookOpen,
    title: "Управление курсами",
    description: "Современный редактор с ИИ для создания интерактивных курсов. Импорт с любых платформ.",
    link: "/feature/ai-courses",
  },
  {
    icon: Settings,
    title: "Настройки курсов",
    description: "Запрет перемотки видео, последовательное прохождение уроков, напоминания и сбор данных слушателей.",
    link: "/feature/course-settings",
  },
  {
    icon: ShoppingCart,
    title: "Магазин курсов",
    description: "Дополнительный канал продаж — ваши курсы видны всем ученикам платформы.",
    link: "/feature/course-store",
  },
  {
    icon: FileSearch,
    title: "Чек-лист документов",
    description: "Сбор и хранение документов слушателей. Упрощение проверок Рособрнадзора.",
    link: "/feature/document-checklist",
  },
  {
    icon: Video,
    title: "Видеоидентификация",
    description: "Подтверждение личности слушателя перед началом обучения.",
    link: "/feature/video-id",
  },
  {
    icon: HardHat,
    title: "Охрана труда",
    description: "Обучение охране труда с протоколами и подписями комиссии.",
    link: "/feature/labor-safety",
  },
  {
    icon: FileCheck,
    title: "Документооборот",
    description: "Договоры, счета, акты, приказы — формируются автоматически.",
    link: "/feature/documents",
  },
  {
    icon: Database,
    title: "ФИС ФРДО",
    description: "Автоматическая выгрузка данных о выданных документах.",
    link: "/feature/frdo",
  },
  {
    icon: Users,
    title: "Слушатели",
    description: "Массовый импорт, автоматическая рассылка логинов. Сбор документов через личный кабинет.",
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
          <h2 className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">Всё для обучения</h2>
          <div className="divider mb-6" />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Полный набор инструментов для дистанционного обучения и документооборота</p>
        </motion.div>

        {/* Features grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-32"
        >
          {features.map((feature, index) => {
            const Wrapper = feature.link ? Link : 'div';
            const wrapperProps = feature.link ? { to: feature.link } : {};
            return (
            <Wrapper key={feature.title} {...wrapperProps as any}>
            <motion.div
              variants={itemVariants}
              whileHover={{ 
                y: -12,
                rotateX: 5,
                rotateY: index % 3 === 0 ? -3 : index % 3 === 2 ? 3 : 0,
                transition: { duration: 0.4, ease: "easeOut" }
              }}
              className="group relative rounded-2xl p-[1px] cursor-pointer h-full"
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
                  <div className="mt-6 flex items-center gap-2">
                    <div className="h-0.5 w-0 group-hover:w-12 bg-gradient-to-r from-accent to-accent/30 rounded-full transition-all duration-500 ease-out" />
                    {feature.link && (
                      <span className="text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center gap-1">
                        Подробнее <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
            </Wrapper>
            );
          })}
        </motion.div>

      </div>
    </section>
  );
}
