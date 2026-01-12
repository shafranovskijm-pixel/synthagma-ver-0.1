import { Check, Star, Crown, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Оптимальный",
    price: "15 000",
    period: "₽/мес",
    description: "Полный функционал для организаций",
    icon: Star,
    popular: true,
    glyph: "𓃀",
    features: [
      "Неограниченное число учеников",
      "Неограниченное число курсов",
      "Документооборот организации",
      "Мобильное приложение",
      "Расширенная аналитика",
      "Приоритетная поддержка",
    ],
    cta: "Начать обучение",
  },
  {
    name: "Максимальный",
    price: "35 000",
    period: "₽/мес",
    description: "Полный функционал для крупных организаций",
    icon: Crown,
    popular: false,
    glyph: "𓅀",
    features: [
      "Всё из тарифа «Оптимальный»",
      "Выгрузка в ФИС ФРДО",
      "ИИ-помощник для курсов",
      "ИИ-ассистент для учеников",
      "API доступ",
      "Персональный менеджер",
    ],
    cta: "Получить предложение",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-32 relative overflow-hidden bg-gradient-to-b from-secondary/20 via-background to-secondary/20">
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <span className="hieroglyphic absolute top-20 left-16 text-5xl text-accent/20 animate-pulse-soft">𓊀</span>
        <span className="hieroglyphic absolute top-1/3 right-10 text-4xl text-primary/15 animate-pulse-soft delay-200">𓉀</span>
        <span className="hieroglyphic absolute bottom-32 left-1/3 text-6xl text-accent/15 animate-pulse-soft delay-300">𓇀</span>
        <span className="greek-text absolute top-1/2 right-8 text-sm text-primary/20 rotate-90">ΑΞΙΑ</span>
      </div>
      
      {/* Cold nitrogen gradient orbs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-gradient-to-br from-accent/10 to-transparent rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-accent/15 to-primary/10 border border-accent/30 mb-8 backdrop-blur-sm">
            <span className="hieroglyphic text-accent text-lg">𓆀</span>
            <span className="text-sm font-semibold text-foreground">Тарифы</span>
            <span className="hieroglyphic text-accent text-lg">𓇀</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Выберите <span className="gradient-text-gold">подходящий план</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Гибкие тарифы для организаций любого размера
          </p>
          
          {/* Egyptian border decoration */}
          <div className="egyptian-border w-32 mx-auto mt-8 rounded-full" />
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative rounded-3xl p-8 animate-slide-up overflow-hidden ${
                plan.popular
                  ? "bg-gradient-to-b from-primary/15 via-[hsl(185_100%_45%/0.1)] to-accent/10 border-2 border-primary/40 shadow-xl scale-105"
                  : "bg-card/80 backdrop-blur-sm border border-primary/20 hover:border-accent/40 transition-colors"
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Hieroglyph watermark */}
              <span className="hieroglyphic absolute top-6 right-6 text-4xl text-accent/20">{plan.glyph}</span>
              
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="bg-gradient-to-r from-primary via-[hsl(185_100%_45%)] to-accent text-foreground text-sm font-semibold px-5 py-1.5 rounded-full shadow-lg">
                    Популярный
                  </div>
                </div>
              )}

              {/* Plan icon */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
                plan.popular
                  ? "bg-gradient-to-br from-primary via-[hsl(185_100%_45%)] to-accent sigma-glow"
                  : "bg-gradient-to-br from-primary/20 to-accent/10 border border-primary/20"
              }`}>
                <plan.icon className={`w-7 h-7 ${plan.popular ? "text-foreground" : "text-primary"}`} />
              </div>

              {/* Plan name & price */}
              <h3 className="font-display text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className={`font-display text-4xl font-bold ${plan.popular ? "gradient-text" : ""}`}>{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
              <p className="text-muted-foreground mb-6">{plan.description}</p>

              {/* Features list */}
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      plan.popular ? "bg-gradient-to-br from-primary to-accent" : "bg-primary/20"
                    }`}>
                      <Check className={`w-3 h-3 ${plan.popular ? "text-foreground" : "text-primary"}`} />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <Link to="/register-organization" className="block">
                <Button
                  size="lg"
                  className={`w-full rounded-xl h-12 font-semibold gap-2 group ${
                    plan.popular 
                      ? "btn-gradient shadow-lg sigma-glow" 
                      : "bg-card border-2 border-primary/30 text-foreground hover:bg-primary/10 hover:border-primary"
                  }`}
                >
                  <span>{plan.cta}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              
              {/* Gold bottom accent for popular */}
              {plan.popular && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent" />
              )}
            </div>
          ))}
        </div>

        {/* Trust indicators */}
        <div className="mt-20 text-center">
          <p className="text-muted-foreground mb-6">Нам доверяют образовательные организации по всей России</p>
          <div className="flex flex-wrap justify-center gap-8">
            {["Соответствие 273-ФЗ", "Защита данных", "Техподдержка 24/7", "99.9% SLA"].map((item, index) => (
              <div key={item} className="flex items-center gap-2 opacity-80">
                <div className="w-5 h-5 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Check className="w-3 h-3 text-foreground" />
                </div>
                <span className="font-medium">{item}</span>
                {index < 3 && <span className="hieroglyphic text-accent/30 ml-4">𓆀</span>}
              </div>
            ))}
          </div>
          
          {/* Greek text decoration */}
          <div className="greek-text text-center mt-8 text-primary/15 text-xs tracking-[0.5em]">
            ΠΙΣΤΙΣ • ΑΞΙΟΠΙΣΤΙΑ • ΠΟΙΟΤΗΤΑ
          </div>
        </div>
      </div>
    </section>
  );
}