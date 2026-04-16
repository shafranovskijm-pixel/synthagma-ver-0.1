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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % subtitles.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden bg-[#0a0e1a]">
      {showStars && <StarfieldCanvas />}

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-12 pb-12 md:pt-16 md:pb-16">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm mb-10"
          >
            <Sparkles className="w-4 h-4 text-[hsl(174,72%,46%)]" />
            <span className="text-sm text-white/80 font-medium">Система дистанционного обучения</span>
          </motion.div>

          {/* Main headline */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-medium leading-[1.1] mb-8 tracking-tight text-white">
              <TypewriterText text="Обучение и документы" speed={60} delay={400} />
              <br />
              <span className="text-white/50">
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
                className={`transition-all duration-500 rounded-full ${
                  i === activeIndex
                    ? 'w-8 h-2 bg-[hsl(174,72%,46%)]'
                    : 'w-2 h-2 bg-white/20 hover:bg-white/40'
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
                className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto leading-relaxed"
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
              <Button size="lg" className="btn-gradient rounded-xl px-10 h-14 text-base gap-2 group shadow-lg shadow-[hsl(174,72%,46%)]/20">
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
