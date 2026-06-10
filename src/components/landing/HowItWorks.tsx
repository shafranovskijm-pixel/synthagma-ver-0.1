import { motion } from "framer-motion";
import {
  Wand2,
  UserPlus,
  GraduationCap,
  FileCheck2,
  ArrowRight,
  Sparkles,
  Store,
  FileText,
  BarChart3,
} from "lucide-react";

const steps = [
  { icon: Wand2, label: "Создали курс" },
  { icon: UserPlus, label: "Добавили ученика" },
  { icon: GraduationCap, label: "Ученик прошёл обучение" },
  { icon: FileCheck2, label: "Документы в порядке" },
];

const miniCards = [
  { icon: Sparkles, label: "ИИ-генерация курсов" },
  { icon: Store, label: "Магазин готовых курсов" },
  { icon: FileText, label: "Документы для учебного центра" },
  { icon: BarChart3, label: "Контроль прохождения" },
];

export function HowItWorks() {
  return (
    <section className="py-16 md:py-20 relative overflow-hidden bg-gradient-to-b from-background via-secondary/15 to-background">
      <div className="container mx-auto max-w-6xl px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-10"
        >
          <span className="text-xs text-accent font-medium tracking-widest uppercase mb-3 block">
            Как это работает
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-medium mb-3 tracking-tight">
            От нажатия кнопки — до выданных документов
          </h2>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto">
            Простой путь собственника: вы запускаете обучение, СИНТАГМА берёт на себя всю рутину.
          </p>
        </motion.div>

        {/* Chain card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative rounded-2xl border border-border bg-card/70 backdrop-blur-sm p-6 md:p-8 shadow-sm"
        >
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 md:gap-2">
            {steps.map((step, i) => (
              <div key={step.label} className="flex md:flex-1 items-center gap-4 md:flex-col md:gap-3 md:text-center">
                <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center shrink-0">
                  <step.icon className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1 md:flex-none">
                  <div className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase mb-1">
                    Шаг {i + 1}
                  </div>
                  <div className="text-sm md:text-base font-medium text-foreground">{step.label}</div>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight className="hidden md:block w-5 h-5 text-muted-foreground/50 shrink-0" />
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Mini-cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6"
        >
          {miniCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-card/70 p-5 flex flex-col items-start gap-3 hover:border-accent/40 hover:shadow-md transition-all"
            >
              <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                <card.icon className="w-5 h-5 text-accent" />
              </div>
              <div className="text-sm font-medium text-foreground leading-snug">{card.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
