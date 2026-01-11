import { Check, Star, Crown, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Стартовый",
    price: "3 000",
    period: "₽/мес",
    description: "Идеально для начала работы с платформой",
    icon: Zap,
    popular: false,
    features: [
      "До 50 учеников",
      "До 5 курсов",
      "Базовая аналитика",
      "Email поддержка",
      "Ссылки для регистрации",
    ],
    cta: "Начать бесплатно",
    variant: "outline" as const,
  },
  {
    name: "Оптимальный",
    price: "12 000",
    period: "₽/мес",
    description: "Полный функционал для организаций",
    icon: Star,
    popular: true,
    features: [
      "Всё из тарифа «Стартовый»",
      "Неограниченное число учеников",
      "Документооборот организации",
      "Мобильное приложение",
      "Расширенная аналитика",
      "Приоритетная поддержка",
    ],
    cta: "Начать обучение",
    variant: "default" as const,
  },
  {
    name: "Максимальный",
    price: "По запросу",
    period: "",
    description: "Полный функционал для крупных организаций",
    icon: Crown,
    popular: false,
    features: [
      "Всё из тарифа «Оптимальный»",
      "Документооборот",
      "Выгрузка в ФИС ФРДО",
      "ИИ-помощник для курсов",
      "ИИ-ассистент для учеников",
      "API доступ",
      "Персональный менеджер",
    ],
    cta: "Получить предложение",
    variant: "outline" as const,
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-32 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sigma-orange/10 border border-sigma-orange/20 mb-6">
            <Crown className="w-4 h-4 text-sigma-orange" />
            <span className="text-sm font-medium text-sigma-orange">Тарифы</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Выберите <span className="gradient-text">подходящий план</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Гибкие тарифы для организаций любого размера
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={plan.name}
              className={`relative rounded-3xl p-8 animate-slide-up ${
                plan.popular
                  ? "bg-gradient-to-b from-primary/10 to-accent/5 border-2 border-primary/30 shadow-xl scale-105"
                  : "glass-card border border-border/50"
              }`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <div className="bg-gradient-to-r from-primary to-accent text-white text-sm font-semibold px-4 py-1.5 rounded-full shadow-lg">
                    Популярный
                  </div>
                </div>
              )}

              {/* Plan icon */}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${
                plan.popular
                  ? "bg-gradient-to-br from-primary to-accent"
                  : "bg-secondary"
              }`}>
                <plan.icon className={`w-7 h-7 ${plan.popular ? "text-white" : "text-primary"}`} />
              </div>

              {/* Plan name & price */}
              <h3 className="font-display text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="font-display text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>
              <p className="text-muted-foreground mb-6">{plan.description}</p>

              {/* Features list */}
              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      plan.popular ? "bg-primary" : "bg-sigma-green/10"
                    }`}>
                      <Check className={`w-3 h-3 ${plan.popular ? "text-white" : "text-sigma-green"}`} />
                    </div>
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA button */}
              <Link to="/register-organization" className="block">
                <Button
                  size="lg"
                  variant={plan.variant}
                  className={`w-full rounded-xl h-12 font-semibold gap-2 group ${
                    plan.popular ? "bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 text-white shadow-lg" : ""
                  }`}
                >
                  <span className="relative z-10">{plan.cta}</span>
                  <ArrowRight className="w-4 h-4 relative z-10 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>
          ))}
        </div>

        {/* Trust indicators */}
        <div className="mt-20 text-center">
          <p className="text-muted-foreground mb-6">Нам доверяют образовательные организации по всей России</p>
          <div className="flex flex-wrap justify-center gap-8 opacity-60">
            {["Соответствие 273-ФЗ", "Защита данных", "Техподдержка 24/7", "99.9% SLA"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="w-5 h-5 text-sigma-green" />
                <span className="font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
