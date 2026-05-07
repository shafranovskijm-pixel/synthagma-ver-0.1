import { motion } from "framer-motion";
import { Check, Server } from "lucide-react";
import { Link } from "react-router-dom";

const features = [
  "Возможность доработки под ваши требования",
  "Установка на ваш сервер",
  "Бессрочная неисключительная лицензия",
  "3 месяца поддержки и помощь с интеграцией ваших документов",
];

export function BoxedVersionCard() {
  return (
    <section id="boxed-version" className="section-padding relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/10 to-background" />
      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="max-w-2xl mx-auto"
        >
          <div className="relative rounded-2xl p-[1px] bg-gradient-to-b from-accent/40 via-accent/15 to-border/40">
            <div className="relative rounded-2xl bg-card/90 backdrop-blur-md p-8 md:p-10">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-accent/10 text-accent">
                  <Server className="w-3.5 h-3.5" />
                  On-premise
                </span>
              </div>

              <h3 className="font-display text-3xl md:text-4xl font-medium tracking-tight mb-2">
                Коробочная версия
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Полный контроль над платформой и данными на вашей инфраструктуре
              </p>

              <div className="mb-7">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-5xl font-medium tracking-tight">540 000</span>
                  <span className="text-lg text-muted-foreground">₽</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  единоразово · 1 неисключительная лицензия
                </p>
              </div>

              <ul className="space-y-3 mb-8">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-foreground/85">
                    <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/proposal/platform"
                className="block w-full text-center py-3 rounded-xl text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 transition-all duration-300 shadow-md hover:shadow-lg"
              >
                Связаться с нами
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
