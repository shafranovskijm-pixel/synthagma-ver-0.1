import {
  BookOpen,
  Bell,
  MessageCircle,
  Volume2,
  Download,
  MonitorSmartphone,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FloatingParticles } from "./FloatingParticles";

const mobileFeatures = [
  { icon: BookOpen, text: "Быстрый доступ с главного экрана" },
  { icon: Bell, text: "Уведомления внутри платформы" },
  { icon: MessageCircle, text: "Чаты с учебным центром" },
  { icon: Volume2, text: "Озвучка текстовых уроков" },
];

export function MobileApp() {
  return (
    <section className="section-padding relative overflow-hidden">
      {/* Floating particles */}
      <FloatingParticles mode="mixed" count={10} />

      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/20 to-background" />
      <div className="absolute inset-0 opacity-[0.012]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px'
      }} />

      {/* Decor: blur spots */}
      <div className="absolute top-[10%] left-[5%] w-72 h-72 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[10%] right-[8%] w-64 h-64 bg-accent/4 rounded-full blur-3xl pointer-events-none" />

      {/* Decor: lines */}
      <motion.div
        className="absolute top-[15%] right-0 w-px h-48 bg-gradient-to-b from-transparent via-accent/20 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
      />
      <motion.div
        className="absolute bottom-[20%] left-0 w-px h-32 bg-gradient-to-b from-transparent via-accent/15 to-transparent"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5, delay: 0.2 }}
      />

      {/* Decor: corners */}
      <motion.div
        className="absolute top-16 left-8 w-14 h-14 border-l border-t border-accent/15 rounded-tl-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.5 }}
      />
      <motion.div
        className="absolute bottom-16 right-8 w-14 h-14 border-r border-b border-accent/15 rounded-br-2xl"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.6 }}
      />

      {/* Decor: diamonds */}
      <motion.div
        className="absolute top-[30%] right-[10%] w-4 h-4 rotate-45 border border-accent/20"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.7 }}
      />
      <motion.div
        className="absolute bottom-[35%] left-[12%] w-3 h-3 rotate-45 bg-accent/10"
        initial={{ opacity: 0, rotate: 0 }}
        whileInView={{ opacity: 1, rotate: 45 }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay: 0.9 }}
      />

      {/* Decor: circles */}
      <motion.div
        className="absolute top-[50%] right-[18%] w-2 h-2 rounded-full bg-accent/30"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.8 }}
      />
      <motion.div
        className="absolute bottom-[25%] left-[6%] w-2.5 h-2.5 rounded-full border border-accent/25"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 1 }}
      />

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="order-2 lg:order-1"
          >
            <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
              Веб-приложение (PWA)
            </span>
            <h3 className="font-display text-3xl md:text-4xl font-medium mb-6 tracking-tight">
              Добавьте СИНТАГМУ на главный экран
            </h3>
            <div className="w-12 h-px bg-accent mb-6" />
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Установите веб-приложение из поддерживаемого браузера на iPhone, Android или компьютер.
              Кабинет и данные остаются теми же, что в веб-версии.
            </p>

            {/* Mobile features */}
            <div className="flex flex-wrap gap-3 mb-8">
              {mobileFeatures.map((feature) => (
                <div
                  key={feature.text}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary/50 border border-border/30"
                >
                  <feature.icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{feature.text}</span>
                </div>
              ))}
            </div>

            {/* Install app button */}
            <div className="flex flex-wrap gap-3">
              <Link
                to="/install"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                <Download className="w-5 h-5" />
                <span className="text-sm font-medium">Установить веб-приложение</span>
              </Link>
            </div>
          </motion.div>

          {/* Honest code-native PWA explainer; not a simulated product screenshot. */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="order-1 lg:order-2 flex justify-center"
          >
            <div className="relative w-full max-w-md">
              <div className="absolute inset-0 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
              <div className="relative rounded-3xl border border-border/60 bg-card/80 p-7 shadow-xl backdrop-blur-sm">
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10">
                    <MonitorSmartphone className="h-7 w-7 text-accent" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Формат</p>
                    <p className="font-display text-2xl font-medium">Веб-приложение PWA</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/60 p-4">
                    <Download className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">Добавление на главный экран</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Доступно в браузерах и операционных системах, которые поддерживают установку PWA.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-2xl border border-border/40 bg-background/60 p-4">
                    <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-medium">Тот же кабинет</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        После входа открываются те же данные и разделы, что и в веб-версии.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
