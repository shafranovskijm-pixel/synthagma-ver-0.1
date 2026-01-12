import { ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function CTA() {
  return (
    <section className="py-32 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-sigma-purple to-accent" />
      
      {/* Mesh overlay */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-white/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-sigma-orange/30 rounded-full blur-3xl animate-float delay-300" />
      </div>
      
      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:60px_60px]" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/15 border border-white/20 mb-10 backdrop-blur-sm">
            <Sparkles className="w-5 h-5 text-white" />
            <span className="text-sm font-semibold text-white">Начните бесплатно</span>
          </div>

          <h2 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-8 leading-tight tracking-tight">
            Готовы автоматизировать обучение и документооборот?
          </h2>

          <p className="text-xl md:text-2xl text-white/80 mb-12 max-w-2xl mx-auto leading-relaxed">
            Присоединяйтесь к десяткам организаций, которые уже используют нашу платформу
            для дистанционного обучения и документооборота
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register-organization">
              <Button
                size="lg"
                className="bg-white text-foreground hover:bg-white/95 hover:text-foreground rounded-2xl px-10 h-16 text-lg font-bold gap-3 shadow-2xl group"
              >
                Попробовать бесплатно
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-white/50 text-white hover:bg-white/20 hover:text-white rounded-2xl px-10 h-16 text-lg backdrop-blur-sm"
              >
                Уже есть аккаунт? Войти
              </Button>
            </Link>
          </div>

          {/* Trust badges */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 text-white/80">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-sigma-green" />
              <span className="font-medium">Бесплатный период 14 дней</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-sigma-green" />
              <span className="font-medium">Не требуется карта</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-sigma-green" />
              <span className="font-medium">Настройка за 5 минут</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
