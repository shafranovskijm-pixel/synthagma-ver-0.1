import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowRight, Play, Sparkles, CheckCircle2, GraduationCap, Users, FileCheck } from "lucide-react";
import { Link } from "react-router-dom";

const heroFeatures = [
  { icon: GraduationCap, text: "Дистанционное обучение" },
  { icon: FileCheck, text: "Документооборот организации" },
  { icon: Users, text: "Соответствие 273-ФЗ" },
];

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-accent/5 to-sigma-purple/8" />
      
      {/* Mesh gradient overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(59,130,246,0.3),rgba(255,255,255,0))]" />
      </div>

      {/* Animated orbs */}
      <div className="absolute top-20 left-[10%] w-72 h-72 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-[10%] w-96 h-96 bg-gradient-to-br from-accent/20 to-sigma-purple/20 rounded-full blur-3xl animate-float delay-300" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-sigma-cyan/10 rounded-full blur-3xl animate-pulse-soft" />
      
      {/* Decorative geometric shapes */}
      <div className="absolute top-32 right-[15%] w-20 h-20 border-2 border-primary/10 rounded-2xl rotate-12 animate-float delay-200" />
      <div className="absolute bottom-32 left-[15%] w-16 h-16 border-2 border-accent/10 rounded-full animate-float delay-500" />
      <div className="absolute top-1/2 left-[5%] w-12 h-12 bg-sigma-orange/10 rounded-xl rotate-45" />

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6">
        <div className="glass-card rounded-2xl px-6 py-4 flex items-center justify-between">
          <SigmaLogo size="md" />
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Возможности
            </a>
            <a href="#for-students" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
              Для учеников
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
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
              <Button className="btn-gradient rounded-xl px-6 shadow-lg">
                Для организаций
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-16 pb-32">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 mb-8 animate-fade-in shadow-sm">
            <Sparkles className="w-5 h-5 text-primary" />
            <span className="text-sm font-semibold text-primary">
              Система дистанционного обучения и документооборота
            </span>
          </div>

          {/* Main headline */}
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[1.1] mb-8 animate-slide-up">
            Обучение и{" "}
            <span className="gradient-text relative">
              документы
              <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                <path d="M2 8C50 4 100 2 150 6C200 10 250 8 298 4" stroke="url(#underline-gradient)" strokeWidth="4" strokeLinecap="round"/>
                <defs>
                  <linearGradient id="underline-gradient" x1="0" y1="0" x2="300" y2="0">
                    <stop stopColor="hsl(217, 91%, 50%)" />
                    <stop offset="0.5" stopColor="hsl(186, 94%, 42%)" />
                    <stop offset="1" stopColor="hsl(256, 67%, 59%)" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <br />
            <span className="text-muted-foreground">в одной системе</span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-3xl mx-auto animate-slide-up delay-100 leading-relaxed">
            Дистанционное обучение, автоматический документооборот организации и
            <span className="text-foreground font-medium"> детальная аналитика</span> по каждому ученику
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-3 mb-10 animate-slide-up delay-150">
            {heroFeatures.map((feature) => (
              <div
                key={feature.text}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border/50 shadow-sm"
              >
                <feature.icon className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">{feature.text}</span>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up delay-200">
            <Link to="/register-organization">
              <Button size="lg" className="btn-gradient rounded-2xl px-10 h-16 text-lg gap-3 sigma-glow shadow-xl group">
                Начать бесплатно
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="rounded-2xl px-10 h-16 text-lg gap-3 border-2 group">
              <Play className="w-5 h-5 group-hover:scale-110 transition-transform" />
              Смотреть демо
            </Button>
          </div>

          {/* Trust text */}
          <p className="text-muted-foreground mt-6 animate-slide-up delay-250">
            <CheckCircle2 className="w-4 h-4 inline mr-1 text-sigma-green" />
            14 дней бесплатно • Не требуется карта
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 animate-slide-up delay-300">
            {[
              { value: "10+", label: "лицензированных организаций" },
              { value: "50k+", label: "обученных учеников" },
              { value: "98%", label: "довольных клиентов" },
              { value: "24/7", label: "техническая поддержка" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card rounded-2xl p-6 text-center hover-lift">
                <div className="text-3xl md:text-4xl font-bold font-display gradient-text mb-2">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating platform preview */}
        <div className="mt-24 relative animate-slide-up delay-400">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none h-32 bottom-0 top-auto" />
          <div className="glass-card rounded-3xl p-2 shadow-2xl max-w-6xl mx-auto border border-white/30">
            <div className="bg-gradient-to-br from-secondary/80 to-secondary/40 rounded-2xl aspect-video flex items-center justify-center relative overflow-hidden">
              {/* Mock UI elements */}
              <div className="absolute top-4 left-4 right-4 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-sigma-pink/60" />
                  <div className="w-3 h-3 rounded-full bg-sigma-orange/60" />
                  <div className="w-3 h-3 rounded-full bg-sigma-green/60" />
                </div>
                <div className="flex-1 h-8 bg-white/10 rounded-lg" />
              </div>
              
              <div className="text-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center mx-auto mb-6 shadow-xl cursor-pointer hover:scale-105 transition-transform">
                  <Play className="w-10 h-10 text-white ml-1" />
                </div>
                <p className="text-muted-foreground font-medium">Смотреть видео о платформе</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
