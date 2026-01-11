import {
  Upload,
  Brain,
  Users,
  BarChart3,
  Shield,
  Layout,
  Sparkles,
  Smartphone,
  BookOpen,
  MessageCircle,
  Bell
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

const mobileFeatures = [
  { icon: BookOpen, text: "Курсы офлайн" },
  { icon: Bell, text: "Push-уведомления" },
  { icon: MessageCircle, text: "Чат с куратором" },
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
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-24">
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

        {/* Mobile App Section */}
        <div className="relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Content */}
            <div className="order-2 lg:order-1">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-sigma-purple/15 to-sigma-pink/15 border border-sigma-purple/20 mb-6">
                <Smartphone className="w-4 h-4 text-sigma-purple" />
                <span className="text-sm font-semibold text-sigma-purple">Мобильное приложение</span>
              </div>
              <h3 className="font-display text-3xl md:text-4xl font-bold mb-6">
                Обучение <span className="gradient-text">в кармане</span>
              </h3>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                Ученики могут проходить курсы где угодно — в дороге, дома или на работе. 
                Приложение синхронизируется с веб-версией в реальном времени.
              </p>
              
              {/* Mobile features */}
              <div className="flex flex-wrap gap-3 mb-8">
                {mobileFeatures.map((feature) => (
                  <div
                    key={feature.text}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-border/50 shadow-sm"
                  >
                    <feature.icon className="w-5 h-5 text-sigma-purple" />
                    <span className="font-medium text-sm">{feature.text}</span>
                  </div>
                ))}
              </div>

              {/* App store badges */}
              <div className="flex gap-4">
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-foreground text-background cursor-pointer hover:opacity-90 transition-opacity">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  <div>
                    <div className="text-xs opacity-80">Скачать в</div>
                    <div className="font-semibold text-sm">App Store</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-foreground text-background cursor-pointer hover:opacity-90 transition-opacity">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.198l2.807 1.626a1 1 0 010 1.73l-2.808 1.626L15.206 12l2.492-2.491zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/>
                  </svg>
                  <div>
                    <div className="text-xs opacity-80">Скачать в</div>
                    <div className="font-semibold text-sm">Google Play</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Phone mockup */}
            <div className="order-1 lg:order-2 flex justify-center">
              <div className="relative">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-sigma-purple/30 to-sigma-pink/30 rounded-[3rem] blur-3xl scale-90" />
                
                {/* Phone frame */}
                <div className="relative w-[280px] md:w-[320px] bg-foreground rounded-[3rem] p-3 shadow-2xl">
                  {/* Screen */}
                  <div className="bg-background rounded-[2.5rem] overflow-hidden aspect-[9/19]">
                    {/* Status bar */}
                    <div className="h-8 bg-gradient-to-r from-primary to-accent flex items-center justify-center">
                      <div className="w-20 h-5 bg-foreground/20 rounded-full" />
                    </div>
                    
                    {/* App content mockup */}
                    <div className="p-4 space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">Добро пожаловать</div>
                          <div className="font-bold text-sm">Иван Петров</div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent" />
                      </div>
                      
                      {/* Progress card */}
                      <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl p-4">
                        <div className="text-xs text-muted-foreground mb-1">Ваш прогресс</div>
                        <div className="font-bold text-lg mb-2">78%</div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full w-[78%] bg-gradient-to-r from-primary to-accent rounded-full" />
                        </div>
                      </div>
                      
                      {/* Course cards */}
                      <div className="space-y-3">
                        <div className="text-sm font-semibold">Мои курсы</div>
                        {[
                          { title: "Охрана труда", progress: 100, color: "from-sigma-green to-sigma-cyan" },
                          { title: "Пожарная безопасность", progress: 65, color: "from-sigma-orange to-sigma-yellow" },
                          { title: "Электробезопасность", progress: 30, color: "from-sigma-purple to-sigma-pink" },
                        ].map((course) => (
                          <div key={course.title} className="bg-card rounded-xl p-3 border border-border/50">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${course.color} flex items-center justify-center`}>
                                <BookOpen className="w-5 h-5 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-xs truncate">{course.title}</div>
                                <div className="text-xs text-muted-foreground">{course.progress}%</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
