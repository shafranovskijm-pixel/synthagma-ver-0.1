import { motion } from "framer-motion";
import { InlineEditable } from "./InlineEditable";
import { 
  Smartphone, 
  KeyRound, 
  UserCog, 
  Car, 
  Stethoscope, 
  ShieldCheck 
} from "lucide-react";

const roadmapItems = [
  {
    title: "Авторизация через Госуслуги",
    description: "Регистрация в Минцифры и авторизация через Госуслуги",
    icon: ShieldCheck,
    status: "in-progress",
    quarter: "Q1 2026",
  },
  {
    title: "Подключение ЭЦП",
    description: "Электронная подпись для документооборота",
    icon: KeyRound,
    status: "planned",
    quarter: "Q2 2026",
  },
  {
    title: "Мобильное приложение",
    description: "Приложение для студентов и организаций",
    icon: Smartphone,
    status: "planned",
    quarter: "Q2 2026",
  },
  {
    title: "Роль владельца",
    description: "Бизнес-показатели и аналитика",
    icon: UserCog,
    status: "planned",
    quarter: "Q3 2026",
  },
  {
    title: "Для автошкол",
    description: "Учёт практики, маршруты, расписание",
    icon: Car,
    status: "planned",
    quarter: "Q3 2026",
  },
  {
    title: "Медицинское образование",
    description: "Специализированные функции для мед. учреждений",
    icon: Stethoscope,
    status: "planned",
    quarter: "Q4 2026",
  },
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
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" as const },
  },
};

export function Roadmap() {
  return (
    <section id="roadmap" className="section-padding relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-secondary/20 via-background to-secondary/20" />
      
      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '48px 48px'
      }} />
      
      {/* Decorative elements */}
      <motion.div 
        className="absolute top-20 right-[15%] w-px h-48 bg-gradient-to-b from-transparent via-accent/30 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div 
        className="absolute top-40 right-[13%] w-px h-32 bg-gradient-to-b from-transparent via-accent/15 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.2 }}
      />
      <motion.div 
        className="absolute bottom-32 left-[10%] w-px h-40 bg-gradient-to-b from-transparent via-border to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.4 }}
      />
      <motion.div 
        className="absolute top-1/3 left-[8%] w-24 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.6 }}
      />
      <motion.div 
        className="absolute bottom-1/4 right-[8%] w-16 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.8 }}
      />
      
      {/* Corner decorations */}
      <motion.div
        className="absolute top-24 left-12 w-16 h-16 border-l border-t border-accent/15 rounded-tl-3xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      />
      <motion.div
        className="absolute bottom-24 right-12 w-16 h-16 border-r border-b border-accent/15 rounded-br-3xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.2 }}
      />
      
      {/* Floating circles */}
      <motion.div
        className="absolute top-1/4 left-[20%] w-2 h-2 rounded-full bg-accent/25"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.5 }}
      />
      <motion.div
        className="absolute top-1/2 right-[25%] w-3 h-3 rounded-full border border-accent/20"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.7 }}
      />
      <motion.div
        className="absolute bottom-1/3 left-[30%] w-1.5 h-1.5 rounded-full bg-accent/30"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.9 }}
      />
      
      {/* Diamond shape */}
      <motion.div
        className="absolute top-1/3 right-[30%] w-4 h-4 rotate-45 border border-accent/15"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 1 }}
      />
      
      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
            Развитие
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
            Дорожная карта
          </h2>
          <div className="divider mb-6" />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Мы постоянно работаем над улучшением платформы
          </p>
        </motion.div>
        
        {/* Roadmap grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto"
        >
          {roadmapItems.map((item) => (
            <motion.div
              key={item.title}
              variants={itemVariants}
              className="group relative bg-card/50 backdrop-blur-sm rounded-xl p-6 border border-border/30 hover:border-accent/30 transition-all duration-500"
            >
              {/* Status badge */}
              <div className={`absolute top-4 right-4 px-2.5 py-1 rounded-full text-[10px] font-medium tracking-wide ${
                item.status === 'in-progress' 
                  ? 'bg-accent/10 text-accent border border-accent/30' 
                  : 'bg-secondary text-muted-foreground border border-border/50'
              }`}>
                {item.status === 'in-progress' ? 'В работе' : item.quarter}
              </div>
              
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-300 ${
                  item.status === 'in-progress'
                    ? 'bg-accent/10 group-hover:bg-accent/20'
                    : 'bg-secondary group-hover:bg-accent/10'
                }`}>
                  <item.icon className={`w-5 h-5 ${
                    item.status === 'in-progress' ? 'text-accent' : 'text-muted-foreground group-hover:text-accent'
                  } transition-colors duration-300`} />
                </div>
                <div className="pr-16">
                  <h3 className="font-display text-base font-medium mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
