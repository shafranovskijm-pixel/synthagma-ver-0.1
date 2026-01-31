import { Star, Quote } from "lucide-react";
import { motion } from "framer-motion";

const testimonials = [
  {
    name: "Алексей Петров",
    role: "Директор учебного центра",
    company: "ООО «Профессионал»",
    content: "Платформа помогла нам полностью автоматизировать обучение сотрудников. Особенно впечатлила функция ИИ-генерации курсов.",
    rating: 5,
  },
  {
    name: "Елена Смирнова",
    role: "Руководитель HR",
    company: "ПАО «ТехноГрупп»",
    content: "Выгрузка в ФИС ФРДО экономит нам десятки часов работы ежемесячно. Рекомендую всем, кто работает с документооборотом.",
    rating: 5,
  },
  {
    name: "Дмитрий Козлов",
    role: "Владелец",
    company: "Автошкола «Стандарт»",
    content: "Перешли на Синтагму с другой платформы — разница колоссальная. Ученики в восторге от ИИ-помощника.",
    rating: 5,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
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

export function Testimonials() {
  return (
    <section className="section-padding relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/30 to-background" />
      
      {/* Decorative elements */}
      <div className="absolute top-1/4 left-0 w-px h-32 bg-gradient-to-b from-transparent via-accent/20 to-transparent" />

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
            Отзывы
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
            Что говорят клиенты
          </h2>
          <div className="divider mb-6" />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Более 10 организаций уже получили лицензию с нашей платформой
          </p>
        </motion.div>

        {/* Testimonials grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
        >
          {testimonials.map((testimonial) => (
            <motion.div
              key={testimonial.name}
              variants={itemVariants}
              className="group bg-card/50 backdrop-blur-sm rounded-2xl p-8 border border-border/30 hover:border-accent/30 transition-all duration-500 hover:shadow-lg"
            >
              {/* Quote icon */}
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-6 group-hover:bg-accent/10 transition-colors duration-300">
                <Quote className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors duration-300" />
              </div>

              {/* Rating */}
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 text-accent fill-accent" />
                ))}
              </div>

              {/* Content */}
              <p className="text-foreground mb-6 leading-relaxed text-sm">
                "{testimonial.content}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
                  <span className="text-foreground font-medium text-sm">
                    {testimonial.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <div className="font-medium text-sm">{testimonial.name}</div>
                  <div className="text-xs text-muted-foreground">{testimonial.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
