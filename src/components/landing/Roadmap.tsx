import { ScrollReveal, ScrollRevealGroup } from "@/components/ui/ScrollReveal";
import { motion } from "framer-motion";
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
    description: "Регистрация в Минцифры и авторизация через Госуслуги вместо видеоидентификации",
    icon: ShieldCheck,
    status: "in-progress",
    quarter: "Q1 2026",
    glyph: "𓂀",
  },
  {
    title: "Подключение ЭЦП",
    description: "Электронная цифровая подпись для юридически значимого документооборота",
    icon: KeyRound,
    status: "planned",
    quarter: "Q2 2026",
    glyph: "𓃀",
  },
  {
    title: "Мобильное приложение",
    description: "Мобильное приложение для студентов и организаций",
    icon: Smartphone,
    status: "planned",
    quarter: "Q2 2026",
    glyph: "𓅀",
  },
  {
    title: "Роль владельца учебного центра",
    description: "Создание роли владельца учебного центра с бизнес-показателями и аналитикой",
    icon: UserCog,
    status: "planned",
    quarter: "Q3 2026",
    glyph: "𓉀",
  },
  {
    title: "Функции для автошкол",
    description: "Специализированные функции для автошкол: учёт практики, маршруты, расписание инструкторов",
    icon: Car,
    status: "planned",
    quarter: "Q3 2026",
    glyph: "𓊀",
  },
  {
    title: "Медицинское образование",
    description: "Специализированные функции для медицинских образовательных учреждений",
    icon: Stethoscope,
    status: "planned",
    quarter: "Q4 2026",
    glyph: "𓇀",
  },
];

export function Roadmap() {
  return (
    <section id="roadmap" className="relative py-24 overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <span className="hieroglyphic absolute top-20 left-10 text-4xl text-accent/10 animate-pulse-soft">𓊀</span>
        <span className="hieroglyphic absolute top-40 right-20 text-3xl text-accent/10 animate-pulse-soft delay-200">𓈀</span>
        <span className="hieroglyphic absolute bottom-40 left-20 text-5xl text-accent/10 animate-pulse-soft delay-300">𓇀</span>
        <span className="greek-text absolute bottom-20 right-10 text-lg text-primary/20">ΜΕΛΛΟΝ</span>
      </div>
      
      {/* Gradient orb */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-accent/10 via-primary/5 to-transparent rounded-full blur-3xl" />
      
      <div className="container mx-auto px-6 relative z-10">
        <ScrollReveal>
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/30 mb-6">
              <span className="hieroglyphic text-accent">𓂀</span>
              <span className="text-sm font-semibold text-foreground">Дорожная карта</span>
            </div>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">
              <span className="gradient-text-gold">Планы</span> развития
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Мы постоянно работаем над улучшением платформы и добавлением новых функций
            </p>
          </div>
        </ScrollReveal>
        
        <ScrollRevealGroup staggerDelay={0.1}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {roadmapItems.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative glass-card rounded-2xl p-6 hover-lift group overflow-hidden"
              >
                {/* Status badge */}
                <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold ${
                  item.status === 'in-progress' 
                    ? 'bg-primary/20 text-primary border border-primary/30' 
                    : 'bg-accent/20 text-accent border border-accent/30'
                }`}>
                  {item.status === 'in-progress' ? 'В разработке' : item.quarter}
                </div>
                
                {/* Glyph watermark */}
                <span className="hieroglyphic absolute bottom-4 right-4 text-4xl text-accent/10 group-hover:text-accent/20 transition-colors">
                  {item.glyph}
                </span>
                
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform ${
                    item.status === 'in-progress'
                      ? 'bg-gradient-to-br from-primary/30 to-primary/10'
                      : 'bg-gradient-to-br from-accent/20 to-accent/5'
                  }`}>
                    <item.icon className={`w-6 h-6 ${
                      item.status === 'in-progress' ? 'text-primary' : 'text-accent'
                    }`} />
                  </div>
                  <div className="pr-16">
                    <h3 className="text-lg font-bold font-display mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </div>
                
                {/* Bottom accent */}
                <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity ${
                  item.status === 'in-progress' ? 'via-primary/40' : 'via-accent/40'
                }`} />
              </motion.div>
            ))}
          </div>
        </ScrollRevealGroup>
        
        {/* Greek decoration */}
        <div className="greek-text text-center mt-12 text-primary/20 text-sm tracking-[0.5em]">
          ΠΡΟΟΔΟΣ • ΚΑΙΝΟΤΟΜΙΑ • ΜΕΛΛΟΝ
        </div>
      </div>
    </section>
  );
}
