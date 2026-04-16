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
      <div className={`absolute top-[5%] right-[5%] w-96 h-96 rounded-full blur-3xl pointer-events-none ${dark ? 'bg-cyan-500/6' : 'bg-accent/5'}`} />
      <div className={`absolute bottom-[5%] left-[3%] w-80 h-80 rounded-full blur-3xl pointer-events-none ${dark ? 'bg-purple-500/6' : 'bg-accent/4'}`} />
      <div className={`absolute top-[40%] left-[15%] w-64 h-64 rounded-full blur-3xl pointer-events-none ${dark ? 'bg-teal-500/4' : 'bg-accent/3'}`} />
      <div className={`absolute top-[20%] right-[20%] w-72 h-72 rounded-full blur-3xl pointer-events-none ${dark ? 'bg-indigo-500/4' : 'bg-primary/3'}`} />

      {/* Decorative corners — all four */}
      <motion.div
        className={`absolute top-10 left-8 w-16 h-16 border-l-2 border-t-2 rounded-tl-2xl ${dark ? 'border-white/10' : 'border-accent/15'}`}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.8 }}
      />
      <motion.div
        className={`absolute top-10 right-8 w-16 h-16 border-r-2 border-t-2 rounded-tr-2xl ${dark ? 'border-white/8' : 'border-accent/10'}`}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 0.9 }}
      />
      <motion.div
        className={`absolute bottom-10 left-8 w-16 h-16 border-l-2 border-b-2 rounded-bl-2xl ${dark ? 'border-white/8' : 'border-accent/10'}`}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 1.0 }}
      />
      <motion.div
        className={`absolute bottom-10 right-8 w-16 h-16 border-r-2 border-b-2 rounded-br-2xl ${dark ? 'border-white/10' : 'border-accent/15'}`}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, delay: 1.1 }}
      />

      {/* Floating decorative lines */}
      <motion.div
        className={`absolute top-[25%] left-[6%] w-24 h-px ${dark ? 'bg-gradient-to-r from-transparent via-white/15 to-transparent' : 'bg-gradient-to-r from-transparent via-accent/20 to-transparent'}`}
        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1.2, delay: 1.2 }}
      />
      <motion.div
        className={`absolute top-[35%] right-[6%] w-20 h-px ${dark ? 'bg-gradient-to-r from-transparent via-white/12 to-transparent' : 'bg-gradient-to-r from-transparent via-accent/15 to-transparent'}`}
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1.2, delay: 1.3 }}
      />
      <motion.div
        className={`absolute bottom-[30%] left-[8%] w-16 h-px ${dark ? 'bg-gradient-to-r from-transparent via-cyan-400/15 to-transparent' : 'bg-gradient-to-r from-transparent via-accent/15 to-transparent'}`}
        initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1.2, delay: 1.4 }}
      />
      <motion.div
        className={`absolute bottom-[25%] right-[10%] w-28 h-px ${dark ? 'bg-gradient-to-r from-transparent via-purple-400/12 to-transparent' : 'bg-gradient-to-r from-transparent via-primary/12 to-transparent'}`}
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1.2, delay: 1.5 }}
      />

      {/* Small decorative dots */}
      <motion.div className={`absolute top-[18%] left-[12%] w-1.5 h-1.5 rounded-full ${dark ? 'bg-cyan-400/30' : 'bg-accent/30'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.0 }} />
      <motion.div className={`absolute top-[70%] right-[14%] w-1 h-1 rounded-full ${dark ? 'bg-purple-400/25' : 'bg-accent/25'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.2 }} />
      <motion.div className={`absolute bottom-[40%] left-[20%] w-1 h-1 rounded-full ${dark ? 'bg-white/20' : 'bg-foreground/15'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.4 }} />
      <motion.div className={`absolute top-[55%] right-[6%] w-1.5 h-1.5 rounded-full ${dark ? 'bg-teal-400/25' : 'bg-accent/20'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.1 }} />
      <motion.div className={`absolute top-[30%] left-[25%] w-2 h-2 rounded-full ${dark ? 'bg-cyan-400/20' : 'bg-accent/25'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.3 }} />
      <motion.div className={`absolute top-[12%] right-[30%] w-1 h-1 rounded-full ${dark ? 'bg-white/25' : 'bg-accent/20'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.9 }} />
      <motion.div className={`absolute bottom-[18%] right-[25%] w-1.5 h-1.5 rounded-full ${dark ? 'bg-purple-400/20' : 'bg-accent/20'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.5 }} />
      <motion.div className={`absolute top-[65%] left-[8%] w-1 h-1 rounded-full ${dark ? 'bg-teal-400/20' : 'bg-accent/15'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.6 }} />

      {/* Decorative diamonds ◇ */}
      <motion.div className={`absolute top-[22%] left-[18%] w-3 h-3 rotate-45 border ${dark ? 'border-white/10' : 'border-accent/15'}`} initial={{ opacity: 0, rotate: 45, scale: 0.5 }} animate={{ opacity: 1, rotate: 45, scale: 1 }} transition={{ duration: 0.8, delay: 1.2 }} />
      <motion.div className={`absolute top-[15%] right-[15%] w-2.5 h-2.5 rotate-45 border ${dark ? 'border-cyan-400/15' : 'border-accent/12'}`} initial={{ opacity: 0, rotate: 45, scale: 0.5 }} animate={{ opacity: 1, rotate: 45, scale: 1 }} transition={{ duration: 0.8, delay: 1.4 }} />
      <motion.div className={`absolute bottom-[22%] left-[14%] w-2 h-2 rotate-45 border ${dark ? 'border-purple-400/12' : 'border-accent/10'}`} initial={{ opacity: 0, rotate: 45, scale: 0.5 }} animate={{ opacity: 1, rotate: 45, scale: 1 }} transition={{ duration: 0.8, delay: 1.6 }} />
      <motion.div className={`absolute bottom-[35%] right-[18%] w-3.5 h-3.5 rotate-45 border ${dark ? 'border-white/8' : 'border-accent/10'}`} initial={{ opacity: 0, rotate: 45, scale: 0.5 }} animate={{ opacity: 1, rotate: 45, scale: 1 }} transition={{ duration: 0.8, delay: 1.3 }} />

      {/* Decorative small squares □ */}
      <motion.div className={`absolute top-[40%] left-[5%] w-3 h-3 rounded-sm border ${dark ? 'border-white/8' : 'border-accent/10'}`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 1.5 }} />
      <motion.div className={`absolute top-[50%] right-[12%] w-2.5 h-2.5 rounded-sm border ${dark ? 'border-cyan-400/10' : 'border-accent/12'}`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 1.7 }} />
      <motion.div className={`absolute bottom-[15%] left-[30%] w-2 h-2 rounded-sm border ${dark ? 'border-purple-400/10' : 'border-accent/8'}`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 1.8 }} />

      {/* Decorative crosses + */}
      <motion.div className={`absolute top-[28%] right-[8%] ${dark ? 'text-white/10' : 'text-accent/12'} text-lg font-light select-none`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.3 }}>+</motion.div>
      <motion.div className={`absolute bottom-[28%] left-[10%] ${dark ? 'text-cyan-400/12' : 'text-accent/10'} text-sm font-light select-none`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.5 }}>+</motion.div>
      <motion.div className={`absolute top-[60%] left-[22%] ${dark ? 'text-white/8' : 'text-accent/8'} text-xs font-light select-none`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 1.7 }}>+</motion.div>

      {/* Decorative chevron brackets */}
      <motion.div className={`absolute top-[45%] left-[3%] ${dark ? 'text-white/8' : 'text-accent/10'} text-xl font-extralight select-none`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1, delay: 1.4 }}>‹›</motion.div>
      <motion.div className={`absolute bottom-[45%] right-[4%] ${dark ? 'text-cyan-400/10' : 'text-accent/8'} text-base font-extralight select-none`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 1, delay: 1.6 }}>⌐¬</motion.div>

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
