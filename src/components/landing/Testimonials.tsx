import { Star, Quote } from "lucide-react";

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

export function Testimonials() {
  return (
    <section className="py-32 bg-gradient-to-b from-secondary/30 to-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sigma-green/10 border border-sigma-green/20 mb-6">
            <Star className="w-4 h-4 text-sigma-green fill-sigma-green" />
            <span className="text-sm font-medium text-sigma-green">Отзывы клиентов</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Что говорят <span className="gradient-text">наши клиенты</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Более 10 организаций уже получили лицензию с нашей платформой
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.name}
              className="glass-card rounded-3xl p-8 hover-lift animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Quote icon */}
              <Quote className="w-10 h-10 text-primary/20 mb-4" />

              {/* Rating */}
              <div className="flex gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star key={i} className="w-5 h-5 text-sigma-orange fill-sigma-orange" />
                ))}
              </div>

              {/* Content */}
              <p className="text-foreground mb-6 leading-relaxed">
                "{testimonial.content}"
              </p>

              {/* Author */}
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <span className="text-white font-bold text-lg">
                    {testimonial.name.charAt(0)}
                  </span>
                </div>
                <div>
                  <div className="font-semibold">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                  <div className="text-sm text-primary">{testimonial.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
