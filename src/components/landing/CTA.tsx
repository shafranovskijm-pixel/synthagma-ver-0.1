import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ScrollReveal } from "@/components/ui/ScrollReveal";

export function CTA() {
  return (
    <section className="py-32 relative overflow-hidden">
      {/* Gradient background - cold nitrogen to gold */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-[hsl(200_90%_40%)] to-accent" />
      
      {/* Mesh overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-white/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/30 rounded-full blur-3xl animate-float delay-300" />
      </div>
      
      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:60px_60px]" />
      
      {/* Decorative hieroglyphs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <span className="hieroglyphic absolute top-20 left-16 text-6xl text-white/10 animate-pulse-soft">𓂀</span>
        <span className="hieroglyphic absolute top-1/3 right-20 text-5xl text-white/10 animate-pulse-soft delay-200">𓃀</span>
        <span className="hieroglyphic absolute bottom-32 left-1/3 text-7xl text-white/10 animate-pulse-soft delay-300">𓅀</span>
        <span className="hieroglyphic absolute bottom-20 right-1/4 text-5xl text-white/10 animate-pulse-soft delay-100">𓆀</span>
        <span className="greek-text absolute top-1/2 left-8 text-sm text-white/10 rotate-90">ΑΡΧΗ</span>
        <span className="greek-text absolute bottom-1/3 right-8 text-sm text-white/10 -rotate-90">ΤΕΛΟΣ</span>
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <ScrollReveal>
            <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-white/15 border border-white/30 mb-10 backdrop-blur-sm">
              <span className="hieroglyphic text-white text-lg">𓊀</span>
              <span className="text-sm font-semibold text-white">Начните бесплатно</span>
              <span className="hieroglyphic text-white text-lg">𓊁</span>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={0.1}>
            <h2 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-tight tracking-tight">
              Готовы автоматизировать обучение и документооборот?
            </h2>
          </ScrollReveal>

          <ScrollReveal delay={0.2}>
            <p className="text-xl md:text-2xl text-white/80 mb-12 max-w-2xl mx-auto leading-relaxed">
              Присоединяйтесь к десяткам организаций, которые уже используют нашу платформу
              для дистанционного обучения и документооборота
            </p>

            {/* Egyptian border decoration */}
            <div className="w-32 h-1 mx-auto mb-12 bg-gradient-to-r from-transparent via-white/50 to-transparent rounded-full" />
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/register-organization">
                <Button
                  size="lg"
                  className="bg-white text-slate-900 hover:bg-amber-50 rounded-2xl px-10 h-16 text-lg font-bold gap-3 shadow-2xl group border-2 border-white transition-all duration-300 hover:shadow-[0_0_30px_rgba(251,191,36,0.6),0_0_60px_rgba(251,191,36,0.3)]"
                >
                  <span className="text-slate-900">Попробовать бесплатно</span>
                  <ArrowRight className="w-5 h-5 text-slate-900 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 border-white/50 bg-transparent text-white hover:bg-white/20 hover:text-white rounded-2xl px-10 h-16 text-lg backdrop-blur-sm"
                >
                  Уже есть аккаунт? Войти
                </Button>
              </Link>
            </div>
          </ScrollReveal>

          {/* Trust badges */}
          <ScrollReveal delay={0.4}>
            <div className="mt-16 flex flex-wrap justify-center gap-8 text-white/80">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span className="font-medium">Бесплатный период 14 дней</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="hieroglyphic text-white/60">𓆀</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span className="font-medium">Не требуется карта</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="hieroglyphic text-white/60">𓇀</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-white" />
                <span className="font-medium">Настройка за 5 минут</span>
              </div>
            </div>
            
            {/* Greek text decoration */}
            <div className="greek-text text-center mt-10 text-white/20 text-xs tracking-[0.5em]">
              ΣΟΦΙΑ • ΔΥΝΑΜΙΣ • ΝΙΚΗ
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}