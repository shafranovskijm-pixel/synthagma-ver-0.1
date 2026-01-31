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
      
      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '40px 40px'
      }} />
      
      {/* Decorative elements */}
      <motion.div 
        className="absolute top-24 left-[12%] w-px h-40 bg-gradient-to-b from-transparent via-accent/25 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div 
        className="absolute top-32 left-[10%] w-px h-28 bg-gradient-to-b from-transparent via-accent/15 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.2 }}
      />
      <motion.div 
        className="absolute bottom-24 right-[15%] w-px h-36 bg-gradient-to-b from-transparent via-border to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.4 }}
      />
      <motion.div 
        className="absolute top-1/2 right-[8%] w-20 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.6 }}
      />
      <motion.div 
        className="absolute bottom-1/3 left-[6%] w-16 h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.8 }}
      />
      
      {/* Corner decorations */}
      <motion.div
        className="absolute top-20 right-16 w-14 h-14 border-r border-t border-accent/15 rounded-tr-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1 }}
      />
      <motion.div
        className="absolute bottom-20 left-16 w-14 h-14 border-l border-b border-accent/15 rounded-bl-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.2 }}
      />
      
      {/* Floating elements */}
      <motion.div
        className="absolute top-1/3 right-[22%] w-2.5 h-2.5 rounded-full bg-accent/20"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.5 }}
      />
      <motion.div
        className="absolute bottom-1/4 left-[25%] w-3 h-3 rounded-full border border-accent/20"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.7 }}
      />
      <motion.div
        className="absolute top-2/3 left-[18%] w-1.5 h-1.5 rounded-full bg-accent/25"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.9 }}
      />
      
      {/* Diamond */}
      <motion.div
        className="absolute bottom-1/3 right-[28%] w-3 h-3 rotate-45 border border-accent/15"
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
