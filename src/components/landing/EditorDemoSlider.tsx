import { useState, useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { EditorDemo } from "./EditorDemo";
import { FrdoPainSlide } from "./FrdoPainSlide";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

const SLIDES = [
  {
    id: "editor",
    badge: "Интерактивный редактор",
    badgeClass: "bg-primary/10 text-primary",
    title: "Создавайте курсы за минуты",
    subtitle: "Блоковый редактор с AI-генерацией и профессиональной озвучкой",
  },
  {
    id: "frdo-pain",
    badge: "Боль клиента",
    badgeClass: "bg-destructive/10 text-destructive",
    title: "Забудьте про «недопустимый символ» в ФИС ФРДО",
    subtitle: "Невидимые пробелы, табуляции, кривой СНИЛС — Синтагма чистит и переупаковывает Excel в эталонный шаблон",
  },
] as const;

/**
 * Two-slide showcase on the landing page: the live editor demo and the
 * FRDO pain story. Auto-rotates every 12s; manual nav via arrows + dots.
 * EditorDemo already renders its own <section> with heading, so we hide
 * its outer chrome and show only its interactive card via a flag-less
 * wrapper that simply mounts it inline. The slider supplies its own
 * unified heading per slide for a consistent look.
 */
export function EditorDemoSlider() {
  const [index, setIndex] = useState(0);
  const total = SLIDES.length;

  const go = useCallback((next: number) => {
    setIndex(((next % total) + total) % total);
  }, [total]);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % total), 12000);
    return () => clearInterval(id);
  }, [total]);

  const slide = SLIDES[index];

  return (
    <section className="py-20 lg:py-28 relative overflow-hidden bg-gradient-to-b from-background via-background to-muted/20">
      <div className="container mx-auto max-w-6xl px-6 relative z-10">
        <ScrollReveal>
          <div className="text-center mb-10">
            <span
              className={`inline-block px-4 py-1.5 rounded-full text-sm font-medium mb-4 transition-colors ${slide.badgeClass}`}
            >
              {slide.badge}
            </span>
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              {slide.title}
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {slide.subtitle}
            </p>
          </div>
        </ScrollReveal>

        <div className="relative">
          {/* Arrows */}
          <button
            type="button"
            aria-label="Предыдущий слайд"
            onClick={() => go(index - 1)}
            className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 lg:-translate-x-12 z-20 w-11 h-11 items-center justify-center rounded-full bg-background border border-border shadow-lg hover:bg-accent hover:text-accent-foreground transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="Следующий слайд"
            onClick={() => go(index + 1)}
            className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 lg:translate-x-12 z-20 w-11 h-11 items-center justify-center rounded-full bg-background border border-border shadow-lg hover:bg-accent hover:text-accent-foreground transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="relative min-h-[520px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                {slide.id === "editor" ? <EditorDemoCardOnly /> : <FrdoPainSlide />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-2 mt-8">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Слайд ${i + 1}`}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-8 bg-accent" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>

          {/* Mobile arrows below dots */}
          <div className="md:hidden flex justify-center gap-3 mt-4">
            <button
              type="button"
              aria-label="Предыдущий слайд"
              onClick={() => go(index - 1)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-background border border-border shadow"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Следующий слайд"
              onClick={() => go(index + 1)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-background border border-border shadow"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Renders only the interactive editor card from EditorDemo by mounting
 * it and letting CSS hide its built-in heading/section padding through
 * a wrapper class. The original EditorDemo already has its own heading,
 * so we offset it with negative margin to visually align inside the
 * slider frame.
 */
function EditorDemoCardOnly() {
  return (
    <div className="-mt-24 md:-mt-28 [&_section]:!py-0 [&_section]:!bg-transparent [&_section_>_div_>_div:first-child]:hidden">
      <EditorDemo />
    </div>
  );
}
