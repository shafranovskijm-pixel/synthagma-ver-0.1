import {
  Upload,
  Brain,
  Users,
  BarChart3,
  Shield,
  Layout,
  Sparkles
} from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Быстрый экспорт курсов",
    description: "Импортируйте готовые курсы с других платформ за считанные минуты",
    gradient: "from-sigma-blue to-sigma-cyan",
  },
  {
    icon: Layout,
    title: "Удобное оформление",
    description: "Лекции, аудио, фото, видео — всё в одном месте с интуитивным редактором",
    gradient: "from-sigma-purple to-sigma-pink",
  },
  {
    icon: Brain,
    title: "ИИ-помощник",
    description: "Подготовка лекций, тестов и самостоятельных работ с помощью искусственного интеллекта",
    gradient: "from-sigma-orange to-sigma-yellow",
  },
  {
    icon: Users,
    title: "Автоматизация",
    description: "Загрузите файл с учениками — система создаст логины и отправит на почту",
    gradient: "from-sigma-green to-sigma-cyan",
  },
  {
    icon: BarChart3,
    title: "Подробные отчёты",
    description: "Получайте детальную статистику прохождения обучения каждым учеником",
    gradient: "from-sigma-pink to-sigma-purple",
  },
  {
    icon: Shield,
    title: "Соответствие 273-ФЗ",
    description: "Более 10 организаций получили лицензию с помощью нашей платформы",
    gradient: "from-sigma-cyan to-sigma-blue",
  },
];

export function Features() {
  return (
    <section id="features" className="py-32 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 mesh-gradient opacity-50" />
      <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-accent/10 to-transparent rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative">
        {/* Section header */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-accent/15 to-sigma-orange/15 border border-accent/20 mb-8 backdrop-blur-sm">
            <Sparkles className="w-5 h-5 text-accent" />
            <span className="text-sm font-semibold bg-gradient-to-r from-accent to-sigma-orange bg-clip-text text-transparent">Возможности платформы</span>
          </div>
          <h2 className="font-display text-4xl md:text-6xl font-bold mb-6 tracking-tight">
            Обучение и <span className="gradient-text">документооборот</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Мощные инструменты для дистанционного обучения, документооборота организации и аналитики
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
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-6 transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl`}>
                <feature.icon className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-display text-xl font-bold mb-3">
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
