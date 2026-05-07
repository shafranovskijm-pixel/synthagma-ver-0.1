import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Globe, Smartphone, ShieldCheck, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import illustration from "@/assets/website-dev-illustration.png";

const perks = [
  { icon: Globe, label: "Соответствие требованиям Минобрнауки" },
  { icon: Smartphone, label: "Адаптивный дизайн под все устройства" },
  { icon: ShieldCheck, label: "Формы заявок и интеграции" },
  { icon: Zap, label: "Запуск под ключ за 1 неделю" },
];

export function WebsiteDevelopmentCard() {
  return (
    <section id="website-development" className="section-padding relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/15 to-background" />
      <div className="absolute top-[20%] right-[8%] w-72 h-72 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative rounded-3xl p-[1px] bg-gradient-to-br from-accent/40 via-accent/10 to-border/30"
        >
          <div className="relative rounded-3xl bg-card/90 backdrop-blur-md p-8 md:p-12 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              {/* Left */}
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent mb-5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Новая услуга
                </span>

                <h3 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4 leading-tight">
                  Разработка сайтов для образовательных организаций под ключ
                </h3>
                <p className="text-base text-muted-foreground mb-7 leading-relaxed">
                  Профессиональный сайт вашего учебного центра с адаптивным дизайном,
                  формами заявок, каталогом курсов и удобным управлением контентом.
                </p>

                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                  {perks.map(({ icon: Icon, label }) => (
                    <li key={label} className="flex items-start gap-2.5 text-sm text-foreground/85">
                      <Icon className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>

                <div className="mb-8">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-5xl font-medium tracking-tight">55 000</span>
                    <span className="text-lg text-muted-foreground">₽</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    фиксированная стоимость · от идеи до запуска
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/proposal/platform"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-all duration-300 shadow-md hover:shadow-lg"
                  >
                    Заказать
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    to="/proposal/platform"
                    className="inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-medium border border-border hover:border-accent/50 hover:bg-accent/5 transition-all duration-300"
                  >
                    Подробнее об услуге
                  </Link>
                </div>
              </div>

              {/* Right — illustration */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-full max-w-md">
                  <div className="absolute inset-0 bg-accent/10 blur-3xl rounded-full" />
                  <img
                    src={illustration}
                    alt="Иллюстрация сайта образовательной организации"
                    width={1024}
                    height={1024}
                    loading="lazy"
                    className="relative w-full h-auto object-contain drop-shadow-xl"
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
