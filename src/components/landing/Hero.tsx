import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ArrowRight, Play, Sparkles, CheckCircle2, GraduationCap, FileCheck, Building2, Zap } from "lucide-react";
import { Link } from "react-router-dom";

const heroFeatures = [
  { icon: GraduationCap, text: "Дистанционное обучение" },
  { icon: FileCheck, text: "Документооборот организации" },
  { icon: Building2, text: "Соответствие 273-ФЗ" },
];

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Mesh gradient background */}
      <div className="absolute inset-0 mesh-gradient" />
      
      {/* Animated gradient orbs */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-primary/25 via-accent/15 to-transparent rounded-full blur-3xl animate-float opacity-60" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-accent/20 via-sigma-orange/15 to-transparent rounded-full blur-3xl animate-float delay-300 opacity-60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-sigma-purple/10 to-transparent rounded-full blur-3xl animate-pulse-soft" />
      
      {/* Grid pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--primary)/0.03)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--primary)/0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

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
              <Button className="btn-gradient rounded-xl px-6 shadow-lg sigma-glow">
                <span>Для организаций</span>
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-20 pb-32">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-primary/15 to-accent/15 border border-primary/20 mb-10 animate-fade-in backdrop-blur-sm">
            <Zap className="w-5 h-5 text-primary animate-pulse" />
            <span className="text-sm font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Система дистанционного обучения и документооборота
            </span>
          </div>

          {/* Main headline */}
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[1.05] mb-8 animate-slide-up tracking-tight">
            Обучение и{" "}
            <span className="gradient-text relative inline-block">
              документы
              <svg className="absolute -bottom-2 left-0 w-full h-3" viewBox="0 0 300 12" fill="none" preserveAspectRatio="none">
                <path d="M2 8C50 4 100 2 150 6C200 10 250 8 298 4" stroke="url(#underline-gradient)" strokeWidth="4" strokeLinecap="round"/>
                <defs>
                  <linearGradient id="underline-gradient" x1="0" y1="0" x2="300" y2="0">
                    <stop stopColor="hsl(250 100% 65%)" />
                    <stop offset="0.5" stopColor="hsl(340 95% 60%)" />
                    <stop offset="1" stopColor="hsl(30 100% 55%)" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <br />
            <span className="text-muted-foreground">в одной системе</span>
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto animate-slide-up delay-100 leading-relaxed">
            Дистанционное обучение, автоматический документооборот организации и
            <span className="text-foreground font-semibold"> детальная аналитика</span> по каждому ученику
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-4 mb-12 animate-slide-up delay-150">
            {heroFeatures.map((feature) => (
              <div
                key={feature.text}
                className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-card border border-border/50 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 group"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm font-semibold">{feature.text}</span>
              </div>
            ))}
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up delay-200">
            <Link to="/register-organization">
              <Button size="lg" className="btn-gradient rounded-2xl px-10 h-16 text-lg gap-3 sigma-glow group">
                <span className="flex items-center gap-3">
                  Начать бесплатно
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="rounded-2xl px-10 h-16 text-lg gap-3 border-2 group hover:bg-primary/5 hover:border-primary/50 transition-all">
              <Play className="w-5 h-5 group-hover:scale-110 transition-transform text-primary" />
              Смотреть демо
            </Button>
          </div>

          {/* Trust text */}
          <p className="text-muted-foreground mt-8 animate-slide-up delay-250 flex items-center justify-center gap-4">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5 text-sigma-green" />
              14 дней бесплатно
            </span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span>Не требуется карта</span>
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 animate-slide-up delay-300">
            {[
              { value: "10+", label: "лицензированных организаций", icon: Building2 },
              { value: "50k+", label: "обученных учеников", icon: GraduationCap },
              { value: "98%", label: "довольных клиентов", icon: Sparkles },
              { value: "24/7", label: "техническая поддержка", icon: Zap },
            ].map((stat) => (
              <div key={stat.label} className="glass-card rounded-2xl p-6 text-center hover-lift group">
                <stat.icon className="w-6 h-6 text-primary mx-auto mb-3 group-hover:scale-110 transition-transform" />
                <div className="text-3xl md:text-4xl font-bold font-display gradient-text mb-2">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Floating platform preview */}
        <div className="mt-24 relative animate-slide-up delay-400">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none h-40 bottom-0 top-auto" />
          <div className="glass-card rounded-3xl p-3 shadow-2xl max-w-6xl mx-auto gradient-border">
            <div className="bg-gradient-to-br from-secondary via-card to-secondary/50 rounded-2xl aspect-video flex items-center justify-center relative overflow-hidden">
              {/* Mock UI elements */}
              <div className="absolute top-4 left-4 right-4 flex items-center gap-3">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-accent/60" />
                  <div className="w-3 h-3 rounded-full bg-sigma-orange/60" />
                  <div className="w-3 h-3 rounded-full bg-sigma-green/60" />
                </div>
                <div className="flex-1 h-8 bg-white/20 rounded-lg backdrop-blur-sm" />
              </div>
              
              <div className="text-center">
                <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary via-accent to-sigma-orange flex items-center justify-center mx-auto mb-6 shadow-2xl cursor-pointer hover:scale-105 transition-transform sigma-glow-accent">
                  <Play className="w-12 h-12 text-white ml-1" />
                </div>
                <p className="text-muted-foreground font-semibold text-lg">Смотреть видео о платформе</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
