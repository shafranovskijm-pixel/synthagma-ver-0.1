import { Button } from "@/components/ui/button";
import { SigmaLogo } from "@/components/ui/SigmaLogo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ArrowRight, Play, CheckCircle2, GraduationCap, FileCheck, Building2, Bot, ShoppingCart, FolderArchive, Shield } from "lucide-react";
import { Link } from "react-router-dom";

const heroFeatures = [
  { icon: GraduationCap, text: "Дистанционное обучение" },
  { icon: FileCheck, text: "Документооборот организации" },
  { icon: Building2, text: "Соответствие 273-ФЗ" },
];

// Greek letters for decorative elements
const greekLetters = "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ";
// Egyptian hieroglyphs (simplified representations)
const hieroglyphs = "𓀀𓀁𓀂𓀃𓁀𓁁𓁂𓁃𓂀𓂁𓂂𓃀𓃁𓃂𓄀𓄁𓅀𓅁𓆀𓆁𓇀𓇁𓈀𓈁𓉀𓉁𓊀𓊁";

export function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-gradient-to-b from-background via-background to-secondary/30">
      {/* Decorative hieroglyphs - scattered around */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <span className="hieroglyphic absolute top-20 left-10 text-4xl text-accent animate-pulse-soft">𓂀</span>
        <span className="hieroglyphic absolute top-40 right-20 text-3xl text-accent animate-pulse-soft delay-200">𓃀</span>
        <span className="hieroglyphic absolute bottom-40 left-20 text-5xl text-accent animate-pulse-soft delay-300">𓅀</span>
        <span className="hieroglyphic absolute top-60 left-1/4 text-2xl text-primary/30 animate-pulse-soft delay-100">𓊀</span>
        <span className="hieroglyphic absolute bottom-60 right-1/4 text-4xl text-accent animate-pulse-soft delay-400">𓈀</span>
        
        {/* Greek letters */}
        <span className="greek-text absolute top-32 right-1/3 text-xl text-primary">ΣΙΓΜΑ</span>
        <span className="greek-text absolute bottom-32 left-1/3 text-lg text-primary/50">ΑΛΦΑ ΩΜΕΓΑ</span>
        <span className="greek-text absolute top-1/2 right-10 text-sm text-primary/30 rotate-90">ΓΝΩΣΙΣ</span>
      </div>
      
      {/* Cold nitrogen gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
      </div>
      
      {/* Animated gradient orbs - cold nitrogen colors */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-primary/20 via-[hsl(185_100%_45%/0.15)] to-transparent rounded-full blur-3xl animate-float opacity-60" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-gradient-to-br from-accent/15 via-[hsl(38_85%_40%/0.1)] to-transparent rounded-full blur-3xl animate-float delay-300 opacity-60" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-br from-[hsl(200_90%_40%/0.08)] to-transparent rounded-full blur-3xl animate-pulse-soft" />
      
      {/* Grid pattern with Egyptian-inspired touches */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(195_100%_50%/0.02)_1px,transparent_1px),linear-gradient(to_bottom,hsl(43_90%_50%/0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />

      {/* Navigation */}
      <nav className="relative z-10 container mx-auto px-6 py-6">
        <div className="glass-card rounded-2xl px-6 py-4 flex items-center justify-between border-b-2 border-accent/20">
          <SigmaLogo size="md" />
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-muted-foreground hover:text-primary transition-colors font-medium">
              Возможности
            </a>
            <a href="#roadmap" className="text-muted-foreground hover:text-primary transition-colors font-medium">
              Дорожная карта
            </a>
            <a href="#pricing" className="text-muted-foreground hover:text-primary transition-colors font-medium">
              Калькулятор стоимости
            </a>
            <Link to="/about" className="text-muted-foreground hover:text-primary transition-colors font-medium">
              О нас
            </Link>
            <Link to="/blog" className="text-muted-foreground hover:text-primary transition-colors font-medium">
              Блог
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link to="/login">
              <Button className="btn-gradient rounded-xl px-6 shadow-lg sigma-glow">
                Войти
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero content */}
      <div className="relative z-10 container mx-auto px-6 pt-16 pb-32">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge with Egyptian styling */}
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border border-accent/30 mb-10 animate-fade-in backdrop-blur-sm">
            <span className="hieroglyphic text-accent text-lg">𓂀</span>
            <span className="text-sm font-semibold text-foreground tracking-wide">
              Система дистанционного обучения
            </span>
            <span className="hieroglyphic text-accent text-lg">𓃀</span>
          </div>

          {/* Main headline - Cinzel font for ancient feel */}
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] mb-8 animate-slide-up tracking-wide">
            <span className="text-foreground">Знания</span>{" "}
            <span className="gradient-text-gold relative inline-block">
              вечны
              <svg className="absolute -bottom-1 left-0 w-full h-2" viewBox="0 0 200 8" fill="none" preserveAspectRatio="none">
                <path d="M0 4C40 2 80 6 120 4C160 2 200 6 200 4" stroke="url(#gold-underline)" strokeWidth="3" strokeLinecap="round"/>
                <defs>
                  <linearGradient id="gold-underline" x1="0" y1="0" x2="200" y2="0">
                    <stop stopColor="hsl(43 90% 50%)" />
                    <stop offset="0.5" stopColor="hsl(45 85% 65%)" />
                    <stop offset="1" stopColor="hsl(38 85% 40%)" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <span className="text-muted-foreground">,</span>
            <br />
            <span className="text-foreground">как</span>{" "}
            <span className="gradient-text">пирамиды</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-3xl mx-auto animate-slide-up delay-100 leading-relaxed font-medium">
            Создавайте курсы, управляйте документами и отслеживайте прогресс учеников
            <span className="text-foreground font-semibold"> — всё в одной системе</span>
          </p>

          {/* Feature pills with cold styling */}
          <div className="flex flex-wrap justify-center gap-4 mb-12 animate-slide-up delay-150">
            {heroFeatures.map((feature, index) => (
              <div
                key={feature.text}
                className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-card/80 backdrop-blur-sm border border-primary/20 shadow-sm hover:shadow-md hover:border-accent/40 transition-all duration-300 group"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <feature.icon className="w-5 h-5 text-primary" />
                </div>
                <span className="text-sm font-semibold">{feature.text}</span>
                {index === 0 && <span className="hieroglyphic text-accent/50 text-sm">𓁀</span>}
              </div>
            ))}
          </div>

          {/* CTA buttons with gold accent */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up delay-200">
            <Link to="/register-organization">
              <Button size="lg" className="btn-gradient rounded-2xl px-10 h-16 text-lg gap-3 sigma-glow group">
                <span className="flex items-center gap-3">
                  Начать бесплатно
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="rounded-2xl px-10 h-16 text-lg gap-3 border-2 border-accent/60 text-foreground bg-accent/10 group hover:bg-accent/20 hover:border-accent transition-all shadow-md">
              <Play className="w-5 h-5 group-hover:scale-110 transition-transform text-accent" />
              <span className="font-semibold">Попробовать бесплатно</span>
            </Button>
          </div>

          {/* Trust text */}
          <p className="text-muted-foreground mt-8 animate-slide-up delay-250 flex items-center justify-center gap-4">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5 text-primary" />
              14 дней бесплатно
            </span>
            <span className="hieroglyphic text-accent/40">𓆀</span>
            <span>Не требуется карта</span>
          </p>

          {/* Features with Egyptian-styled cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-20 animate-slide-up delay-300">
            {[
              { 
                title: "ИИ-ассистент", 
                description: "ИИ поможет вам подготовить учебный материал и тестирование", 
                icon: Bot, 
                glyph: "𓂀" 
              },
              { 
                title: "Автоматизация документов", 
                description: "Автоматизированный документооборот поможет получить лицензию или пройти проверки в Рособрнадзоре", 
                icon: Shield, 
                glyph: "𓉀" 
              },
              { 
                title: "Единый архив", 
                description: "Все ваши документы в одном месте", 
                icon: FolderArchive, 
                glyph: "𓃀" 
              },
              { 
                title: "Магазин курсов", 
                description: "Вам не нужен методист — теперь курс или учебную программу вы можете приобрести в магазине курсов", 
                icon: ShoppingCart, 
                glyph: "𓅀" 
              },
            ].map((feature) => (
              <div key={feature.title} className="relative glass-card rounded-2xl p-6 text-left hover-lift group overflow-hidden">
                {/* Egyptian glyph watermark */}
                <span className="hieroglyphic absolute top-3 right-3 text-3xl text-accent/20 group-hover:text-accent/40 transition-colors">{feature.glyph}</span>
                
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold font-display gradient-text mb-2">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                </div>
                
                {/* Gold bottom accent */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>

        {/* Platform preview with Egyptian border */}
        <div className="mt-24 relative animate-slide-up delay-400">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none h-40 bottom-0 top-auto" />
          
          {/* Egyptian border decoration */}
          <div className="egyptian-border w-1/2 mx-auto mb-4 rounded-full" />
          
          <div className="glass-card rounded-3xl p-3 shadow-2xl max-w-6xl mx-auto gradient-border relative">
            {/* Corner decorations */}
            <span className="hieroglyphic absolute -top-4 -left-4 text-3xl text-accent/30">𓊀</span>
            <span className="hieroglyphic absolute -top-4 -right-4 text-3xl text-accent/30">𓊁</span>
            
            <div className="bg-gradient-to-br from-secondary via-card to-secondary/50 rounded-2xl aspect-video flex items-center justify-center relative overflow-hidden">
              {/* Mock UI elements */}
              <div className="absolute top-4 left-4 right-4 flex items-center gap-3">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary/60" />
                  <div className="w-3 h-3 rounded-full bg-accent/60" />
                  <div className="w-3 h-3 rounded-full bg-[hsl(175_70%_45%)]/60" />
                </div>
                <div className="flex-1 h-8 bg-white/20 rounded-lg backdrop-blur-sm" />
              </div>
              
              <div className="text-center">
                <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary via-[hsl(185_100%_45%)] to-accent flex items-center justify-center mx-auto mb-6 shadow-2xl cursor-pointer hover:scale-105 transition-transform sigma-glow">
                  <Play className="w-12 h-12 text-white ml-1" />
                </div>
                <p className="text-muted-foreground font-semibold text-lg">Смотреть видео о платформе</p>
              </div>
              
              {/* Decorative hieroglyphs in preview */}
              <span className="hieroglyphic absolute bottom-4 left-4 text-2xl text-accent/20">𓅀𓆀𓇀</span>
              <span className="hieroglyphic absolute bottom-4 right-4 text-2xl text-accent/20">𓈀𓉀𓊀</span>
            </div>
          </div>
          
          {/* Greek text decoration */}
          <div className="greek-text text-center mt-6 text-primary/20 text-sm tracking-[0.5em]">
            ΣΟΦΙΑ • ΓΝΩΣΙΣ • ΑΡΕΤΗ
          </div>
        </div>
      </div>
    </section>
  );
}