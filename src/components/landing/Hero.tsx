import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { TypewriterText } from "@/components/ui/TypewriterText";
import { StarfieldCanvas } from "@/components/landing/StarfieldCanvas";

const subtitles = [
  "Создавайте курсы, управляйте документами и отслеживайте прогресс учеников. Полное соответствие требованиям законодательства.",
  "Дистанционное обучение — запускайте курсы с видео, тестами и ИИ-генерацией за минуты.",
  "Документооборот — автоматическая генерация приказов, протоколов, удостоверений и дипломов.",
  "Соответствие 273-ФЗ — видеоидентификация, журналы, ФИС ФРДО и полный комплект ЛОО.",
  "300+ готовых курсов — охрана труда, пожарная безопасность, промышленная безопасность и не только.",
];

export function Hero({ showStars = true }: { showStars?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const dark = showStars; // when stars are shown, always use white text; otherwise use theme tokens

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % subtitles.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className={`relative overflow-hidden ${dark ? 'bg-[#0a0e1a]' : 'bg-background'}`}>
      {dark && <StarfieldCanvas />}

      {/* Decorative glows */}
      <div className={`absolute top-[10%] right-[8%] w-80 h-80 rounded-full blur-3xl pointer-events-none ${dark ? 'bg-cyan-500/5' : 'bg-accent/5'}`} />
      <div className={`absolute bottom-[5%] left-[5%] w-64 h-64 rounded-full blur-3xl pointer-events-none ${dark ? 'bg-purple-500/5' : 'bg-accent/4'}`} />

      {/* Decorative corners */}
      <motion.div
        className={`absolute top-12 left-8 w-14 h-14 border-l border-t rounded-tl-2xl ${dark ? 'border-white/10' : 'border-accent/15'}`}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.8 }}
      />
      <motion.div
        className={`absolute bottom-12 right-8 w-14 h-14 border-r border-b rounded-br-2xl ${dark ? 'border-white/10' : 'border-accent/15'}`}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.9 }}
      />

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-12 pb-12 md:pt-16 md:pb-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full border backdrop-blur-sm mb-10 ${dark ? 'border-white/20 bg-white/5' : 'border-border bg-secondary/50'}`}
          >
            <Sparkles className="w-4 h-4 text-accent" />
            <span className={`text-sm font-medium ${dark ? 'text-white/80' : 'text-foreground/80'}`}>Система дистанционного обучения</span>
          </motion.div>

          {/* Main headline */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <h1 className={`font-display text-5xl md:text-6xl lg:text-7xl font-medium leading-[1.1] mb-8 tracking-tight ${dark ? 'text-white' : 'text-foreground'}`}>
              <TypewriterText text="Обучение и документы" speed={60} delay={400} />
              <br />
              <span className={dark ? 'text-white/50' : 'text-muted-foreground'}>
                <TypewriterText text="в одной системе" speed={60} delay={1700} />
              </span>
            </h1>
          </motion.div>

          {/* Indicator dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.4 }}
            className="flex items-center justify-center gap-2 mb-8"
          >
            {subtitles.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === activeIndex
                    ? 'w-10 bg-accent'
                    : 'w-6 bg-foreground/20 hover:bg-foreground/40'
                }`}
              />
            ))}
          </motion.div>

          {/* Rotating subtitle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mb-12 h-[72px] md:h-[56px] flex items-center justify-center"
          >
            <AnimatePresence mode="wait">
              <motion.p
                key={activeIndex}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4 }}
                className={`text-lg md:text-xl max-w-2xl mx-auto leading-relaxed ${dark ? 'text-white/50' : 'text-muted-foreground'}`}
              >
                {subtitles[activeIndex]}
              </motion.p>
            </AnimatePresence>
          </motion.div>

          {/* Single CTA button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex justify-center"
          >
            <Link to="/register-organization">
              <Button size="lg" className="btn-gradient rounded-xl px-10 h-14 text-base gap-2 group shadow-lg shadow-accent/20">
                Начать бесплатно
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
