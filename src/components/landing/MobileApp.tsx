import {
  BookOpen,
  Bell,
  MessageCircle,
  Volume2,
  Download,
  Smartphone,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FloatingParticles } from "./FloatingParticles";

const mobileFeatures = [
  { icon: BookOpen, text: "Курсы офлайн" },
  { icon: Bell, text: "Уведомления" },
  { icon: MessageCircle, text: "Чат с куратором" },
  { icon: Volume2, text: "Озвучка лекций" },
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
              Мобильное приложение
            </span>
            <h3 className="font-display text-3xl md:text-4xl font-medium mb-6 tracking-tight">
              Обучение в кармане
            </h3>
            <div className="w-12 h-px bg-accent mb-6" />
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Ученики могут проходить курсы где угодно.
              Приложение синхронизируется с веб-версией в реальном времени.
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

            {/* Install app buttons */}
            <div className="flex flex-wrap gap-3">
              <Link
                to="/install"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                <Download className="w-5 h-5" />
                <span className="text-sm font-medium">Установить приложение</span>
              </Link>
              <button
                onClick={() => {
                  import('sonner').then(({ toast }) => toast.info('В разработке, скоро будет доступно'));
                }}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-foreground/20 text-foreground hover:bg-foreground/10 transition-colors"
              >
                <Download className="w-5 h-5" />
                <span className="text-sm font-medium">Скачать APK</span>
              </button>
            </div>
          </motion.div>

          {/* Phone mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="order-1 lg:order-2 flex justify-center"
          >
            <div className="relative">
              {/* Glow effect */}
              <div className="absolute inset-0 bg-accent/10 rounded-[3rem] blur-3xl scale-90" />

              {/* Phone frame */}
              <div className="relative w-[280px] bg-foreground rounded-[3rem] p-3 shadow-2xl">
                {/* Screen */}
                <div className="bg-background rounded-[2.5rem] overflow-hidden aspect-[9/19]">
                  {/* Status bar */}
                  <div className="h-7 bg-secondary flex items-center justify-center">
                    <div className="w-20 h-4 bg-foreground/10 rounded-full" />
                  </div>

                  {/* App content */}
                  <div className="p-4 space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-muted-foreground">Добро пожаловать</div>
                        <div className="font-medium text-xs">Иван Петров</div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-accent/20" />
                    </div>

                    {/* Progress card */}
                    <div className="bg-secondary/50 rounded-xl p-3 border border-border/30">
                      <div className="text-[10px] text-muted-foreground mb-1">Прогресс</div>
                      <div className="font-medium text-sm mb-2">78%</div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full w-[78%] bg-accent rounded-full" />
                      </div>
                    </div>

                    {/* Course cards */}
                    <div className="space-y-2">
                      <div className="text-xs font-medium">Мои курсы</div>
                      {[
                        { title: "Охрана труда", progress: 100 },
                        { title: "Пожарная безопасность", progress: 65 },
                        { title: "Электробезопасность", progress: 30 },
                      ].map((course) => (
                        <div key={course.title} className="bg-card rounded-lg p-2.5 border border-border/30">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                              <BookOpen className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[10px] truncate">{course.title}</div>
                              <div className="text-[10px] text-muted-foreground">{course.progress}%</div>
                            </div>
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
      </div>
    </section>
  );
}
