import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-sigma-purple/5" />

      {/* Animated shapes */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float delay-300" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-sigma-purple/5 rounded-full blur-3xl" />

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <SigmaLogo size="md" />
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              Возможности
            </a>
            <a href="#for-students" className="text-muted-foreground hover:text-foreground transition-colors">
              Для учеников
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Тарифы
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" className="font-medium">
                Войти
              </Button>
            </Link>
            <Link to="/register-organization">
              <Button className="btn-gradient rounded-xl px-6">
                Для организаций
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-20 pb-32">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">
              Соответствует 273-ФЗ
            </span>
          </div>

          {/* Main headline */}
          <h1 className="font-display text-5xl md:text-7xl font-bold leading-tight mb-6 animate-slide-up">
            Современная платформа{" "}
            <span className="gradient-text">
              дистанционного обучения
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-slide-up delay-100">
            Создавайте курсы с помощью ИИ, автоматизируйте обучение и получайте
            детальную аналитику по каждому ученику
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up delay-200">
            <Link to="/register">
              <Button size="lg" className="btn-gradient rounded-xl px-8 h-14 text-lg gap-2 sigma-glow">
                Попробовать бесплатно
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="rounded-xl px-8 h-14 text-lg gap-2">
              <Play className="w-5 h-5" />
              Смотреть демо
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 mt-20 animate-slide-up delay-300">
            <div className="text-center">
              <div className="text-4xl font-bold font-display gradient-text">10+</div>
              <div className="text-muted-foreground mt-1">организаций с лицензией</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold font-display gradient-text">50k+</div>
              <div className="text-muted-foreground mt-1">учеников обучено</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold font-display gradient-text">98%</div>
              <div className="text-muted-foreground mt-1">довольных клиентов</div>
            </div>
          </div>
        </div>

        {/* Floating platform preview */}
        <div className="mt-20 relative animate-slide-up delay-400">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
          <div className="glass-card rounded-3xl p-4 shadow-2xl max-w-5xl mx-auto">
            <div className="bg-secondary/50 rounded-2xl aspect-video flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Play className="w-8 h-8 text-primary ml-1" />
                </div>
                <p className="text-muted-foreground">Интерактивный превью платформы</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
