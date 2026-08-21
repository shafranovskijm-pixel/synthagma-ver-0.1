import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Globe, Smartphone, ShieldCheck, Zap, ClipboardCheck, LayoutTemplate, Rocket } from "lucide-react";
import { Link } from "react-router-dom";

const perks = [
  { icon: Globe, label: "Структура сайта согласуется с образовательной организацией" },
  { icon: Smartphone, label: "Адаптивный дизайн под все устройства" },
  { icon: ShieldCheck, label: "Формы заявок и интеграции" },
  { icon: Zap, label: "Запуск по согласованному плану" },
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
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground mb-5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Дополнительная услуга
                </span>

                <h3 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-4 leading-tight">
                  Сайт для образовательной организации под ключ
                </h3>
                <p className="text-base text-muted-foreground mb-7 leading-relaxed">
                  Разработаем сайт учебного центра с каталогом курсов и формами заявок.
                  Состав разделов и содержание согласуем с вашей организацией до запуска.
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

              {/* Right — factual process, not a generic generated illustration. */}
              <div className="hidden lg:flex items-center justify-center">
                <div className="relative w-full max-w-md rounded-3xl border border-border/50 bg-background/60 p-6 shadow-xl">
                  <p className="mb-5 text-xs font-medium uppercase tracking-widest text-accent">Этапы работы</p>
                  <div className="space-y-3">
                    {[
                      { icon: ClipboardCheck, title: "Согласуем", text: "структуру, материалы и формы" },
                      { icon: LayoutTemplate, title: "Разработаем", text: "страницы и адаптивную версию" },
                      { icon: Rocket, title: "Опубликуем", text: "после проверки и согласования" },
                    ].map(({ icon: Icon, title, text }, index) => (
                      <div key={title} className="flex items-center gap-4 rounded-2xl border border-border/40 bg-card/80 p-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10">
                          <Icon className="h-5 w-5 text-accent" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold"><span className="mr-2 text-accent/70">0{index + 1}</span>{title}</p>
                          <p className="text-xs text-muted-foreground">{text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
