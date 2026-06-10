import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";

const advantages = [
  "Настроим систему под ваш учебный центр",
  "Подключите учеников и отправляйте курсы в пару кликов",
  "Готовые курсы, ИИ и документы в одном месте",
];

export function Hero({ showStars = true }: { showStars?: boolean }) {
  const dark = showStars;

  return (
    <section className={`relative overflow-hidden ${dark ? 'bg-[#0a0e1a]' : 'bg-background'}`}>
      {dark && <StarfieldCanvas />}

      {/* Decorative glows */}
      <div className={`absolute top-[5%] right-[5%] w-96 h-96 rounded-full blur-3xl pointer-events-none ${dark ? 'bg-cyan-500/6' : 'bg-accent/5'}`} />
      <div className={`absolute bottom-[5%] left-[3%] w-80 h-80 rounded-full blur-3xl pointer-events-none ${dark ? 'bg-purple-500/6' : 'bg-accent/4'}`} />
      <div className={`absolute top-[40%] left-[15%] w-64 h-64 rounded-full blur-3xl pointer-events-none ${dark ? 'bg-teal-500/4' : 'bg-accent/3'}`} />

      {/* Corner decor */}
      <motion.div
        className={`absolute top-10 left-8 w-16 h-16 border-l-2 border-t-2 rounded-tl-2xl ${dark ? 'border-white/10' : 'border-accent/15'}`}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.6 }}
      />
      <motion.div
        className={`absolute bottom-10 right-8 w-16 h-16 border-r-2 border-b-2 rounded-br-2xl ${dark ? 'border-white/10' : 'border-accent/15'}`}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.8 }}
      />

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-16 pb-16 md:pt-20 md:pb-20">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border mb-8 ${dark ? 'border-white/20 bg-white/5' : 'border-border bg-secondary/50'}`}
          >
            <Sparkles className="w-4 h-4 text-accent" />
            <span className={`text-sm font-medium ${dark ? 'text-white/80' : 'text-foreground/80'}`}>
              Для учебных центров, ДПО и профобучения
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className={`font-display text-4xl md:text-5xl lg:text-6xl font-medium leading-[1.1] mb-6 tracking-tight ${dark ? 'text-white' : 'text-foreground'}`}
          >
            Запустим дистанционное обучение в вашем учебном центре{" "}
            <span className="text-accent">за 7 дней</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className={`text-base md:text-lg max-w-2xl mx-auto leading-relaxed mb-8 ${dark ? 'text-white/60' : 'text-muted-foreground'}`}
          >
            СИНТАГМА помогает быстро подключить учеников, выдать им курсы, контролировать обучение и
            вести документы в одной системе. Готовые курсы, ИИ-генерация и магазин курсов уже внутри.
          </motion.p>

          {/* 3 advantages */}
          <motion.ul
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex flex-col md:flex-row md:flex-wrap items-start md:items-center md:justify-center gap-x-6 gap-y-2.5 mb-10 text-left md:text-center"
          >
            {advantages.map((a) => (
              <li key={a} className="flex items-start md:items-center gap-2">
                <span className="inline-flex w-5 h-5 rounded-full bg-accent/15 items-center justify-center shrink-0 mt-0.5 md:mt-0">
                  <Check className="w-3 h-3 text-accent" />
                </span>
                <span className={`text-sm ${dark ? 'text-white/75' : 'text-foreground/80'}`}>{a}</span>
              </li>
            ))}
          </motion.ul>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto justify-center">
              <Link to="/register-organization" className="w-full sm:w-auto">
                <Button size="lg" className="btn-gradient rounded-xl px-8 h-14 text-base gap-2 group shadow-lg shadow-accent/20 w-full">
                  Оставить заявку на запуск
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/demo-join" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className={`rounded-xl px-8 h-14 text-base w-full ${dark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white' : ''}`}
                >
                  Посмотреть демо
                </Button>
              </Link>
            </div>
            <p className={`text-xs ${dark ? 'text-white/40' : 'text-muted-foreground'}`}>
              Старт за 7 дней · Помощь на каждом шаге · Без отдельной платы за внедрение
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
