import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function CTA() {
  return (
    <section className="py-32 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-accent to-sigma-purple opacity-90" />
      
      {/* Animated shapes */}
      <div className="absolute top-10 left-10 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-float delay-300" />
      
      {/* Decorative elements */}
      <div className="absolute top-20 right-1/4 w-20 h-20 border border-white/20 rounded-2xl rotate-12" />
      <div className="absolute bottom-20 left-1/4 w-16 h-16 border border-white/20 rounded-full" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-8">
            <Sparkles className="w-4 h-4 text-white" />
            <span className="text-sm font-medium text-white">Начните бесплатно</span>
          </div>

          <h2 className="font-display text-4xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Готовы автоматизировать обучение?
          </h2>

          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            Присоединяйтесь к десяткам организаций, которые уже используют нашу платформу
            для эффективного дистанционного обучения
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register-organization">
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-white/90 rounded-xl px-8 h-14 text-lg font-semibold gap-2 shadow-xl"
              >
                Попробовать бесплатно
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/login">
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 text-white hover:bg-white/10 rounded-xl px-8 h-14 text-lg"
              >
                Уже есть аккаунт? Войти
              </Button>
            </Link>
          </div>

          {/* Trust badges */}
          <div className="mt-16 flex flex-wrap justify-center gap-8 text-white/70">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-sigma-green" />
              <span>Бесплатный период 14 дней</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-sigma-green" />
              <span>Не требуется карта</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-sigma-green" />
              <span>Настройка за 5 минут</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
