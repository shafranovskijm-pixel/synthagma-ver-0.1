import {
  Upload,
  Brain,
  Users,
  BarChart3,
  Shield,
  Layout,
  Zap
} from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Быстрый экспорт курсов",
    description: "Импортируйте готовые курсы с других платформ за считанные минуты",
    color: "text-sigma-blue bg-sigma-blue/10",
  },
  {
    icon: Layout,
    title: "Удобное оформление",
    description: "Лекции, аудио, фото, видео — всё в одном месте с интуитивным редактором",
    color: "text-sigma-cyan bg-sigma-cyan/10",
  },
  {
    icon: Brain,
    title: "ИИ-помощник",
    description: "Подготовка лекций, тестов и самостоятельных работ с помощью искусственного интеллекта",
    color: "text-sigma-purple bg-sigma-purple/10",
  },
  {
    icon: Users,
    title: "Автоматизация",
    description: "Загрузите файл с учениками — система создаст логины и отправит на почту",
    color: "text-sigma-green bg-sigma-green/10",
  },
  {
    icon: BarChart3,
    title: "Подробные отчёты",
    description: "Получайте детальную статистику прохождения обучения каждым учеником",
    color: "text-sigma-orange bg-sigma-orange/10",
  },
  {
    icon: Shield,
    title: "Соответствие 273-ФЗ",
    description: "Более 10 организаций получили лицензию с помощью нашей платформы",
    color: "text-sigma-pink bg-sigma-pink/10",
  },
];

export function Features() {
  return (
    <section id="features" className="py-32 relative">
      <div className="container mx-auto px-6">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
            <Zap className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-accent">Возможности платформы</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Всё для <span className="gradient-text">эффективного</span> обучения
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Мощные инструменты для создания курсов, управления учениками и аналитики
          </p>
        </div>

        {/* Features grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="feature-card group animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110 ${feature.color}`}>
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-2">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
