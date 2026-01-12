import { Star, Quote } from "lucide-react";
import { ScrollReveal, ScrollRevealGroup, scrollRevealItem } from "@/components/ui/ScrollReveal";
import { motion } from "framer-motion";

const testimonials = [
  {
    name: "Алексей Петров",
    role: "Директор учебного центра",
    company: "ООО «Профессионал»",
    content: "Платформа помогла нам полностью автоматизировать обучение сотрудников. Особенно впечатлила функция ИИ-генерации курсов.",
    rating: 5,
    glyph: "𓂀",
  },
  {
    name: "Елена Смирнова",
    role: "Руководитель HR",
    company: "ПАО «ТехноГрупп»",
    content: "Выгрузка в ФИС ФРДО экономит нам десятки часов работы ежемесячно. Рекомендую всем, кто работает с документооборотом.",
    rating: 5,
    glyph: "𓃀",
  },
  {
    name: "Дмитрий Козлов",
    role: "Владелец",
    company: "Автошкола «Стандарт»",
    content: "Перешли на Синтагму с другой платформы — разница колоссальная. Ученики в восторге от ИИ-помощника.",
    rating: 5,
    glyph: "𓅀",
  },
];

export function Testimonials() {
  return (
    <section className="py-32 relative overflow-hidden bg-gradient-to-b from-background via-secondary/30 to-background">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <span className="hieroglyphic absolute top-16 left-12 text-5xl text-accent/20 animate-pulse-soft">𓉀</span>
        <span className="hieroglyphic absolute top-1/2 right-16 text-4xl text-primary/15 animate-pulse-soft delay-200">𓊀</span>
        <span className="hieroglyphic absolute bottom-24 left-1/4 text-6xl text-accent/15 animate-pulse-soft delay-300">𓈀</span>
        <span className="greek-text absolute bottom-1/3 left-8 text-sm text-primary/20 rotate-90">ΜΑΡΤΥΡΙΑ</span>
      </div>
      
      {/* Cold nitrogen gradient orb */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-gradient-to-br from-primary/10 via-[hsl(185_100%_45%/0.08)] to-transparent rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <ScrollReveal className="text-center mb-16">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-accent/15 to-primary/10 border border-accent/30 mb-8 backdrop-blur-sm">
            <Star className="w-5 h-5 text-accent fill-accent" />
            <span className="text-sm font-semibold text-foreground">Отзывы клиентов</span>
            <span className="hieroglyphic text-accent text-lg">𓇀</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Что говорят <span className="gradient-text-gold">наши клиенты</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Более 10 организаций уже получили лицензию с нашей платформой
          </p>
          
          {/* Egyptian border decoration */}
          <div className="egyptian-border w-32 mx-auto mt-8 rounded-full" />
        </ScrollReveal>

        {/* Testimonials grid */}
        <ScrollRevealGroup className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto" staggerDelay={0.15}>
          {testimonials.map((testimonial) => (
            <motion.div
              key={testimonial.name}
              variants={scrollRevealItem}
              className="relative bg-card/80 backdrop-blur-sm rounded-3xl p-8 border border-primary/20 hover:border-accent/40 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-2 overflow-hidden group"
            >
              {/* Hieroglyph watermark */}
              <span className="hieroglyphic absolute top-4 right-4 text-4xl text-accent/20 group-hover:text-accent/40 transition-colors">
                {testimonial.glyph}
              </span>
              
              {/* Quote icon with gradient */}
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center mb-4">
                <Quote className="w-6 h-6 text-primary" />
              </div>

              {/* Rating - gold stars */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-accent fill-accent" />
                ))}
              </div>

              {/* Content */}
              <p className="text-foreground mb-6 leading-relaxed">
                "{testimonial.content}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary via-[hsl(185_100%_45%)] to-accent flex items-center justify-center sigma-glow">
                  <span className="text-foreground font-bold text-lg">
                    {testimonial.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <div className="font-semibold">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  <div className="text-sm text-primary">{testimonial.company}</div>
                </div>
              </div>
              
              {/* Gold bottom accent on hover */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
          ))}
        </ScrollRevealGroup>
        
        {/* Greek text decoration */}
        <div className="greek-text text-center mt-12 text-primary/15 text-xs tracking-[0.5em]">
          ΔΟΞΑ • ΕΠΙΤΥΧΙΑ • ΑΡΙΣΤΕΙΑ
        </div>
      </div>
    </section>
  );
}