import {
  BookOpen,
  Bell,
  MessageCircle,
  Volume2,
  Download,
} from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FloatingParticles } from "./FloatingParticles";
import mobileMockup from "@/assets/mobile-app-mockup.png";

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

          {/* Phone mockup — realistic photo */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="order-1 lg:order-2 flex justify-center"
          >
            <div className="relative">
              {/* Glow halo behind device */}
              <div className="absolute inset-0 bg-accent/20 rounded-full blur-3xl scale-75 pointer-events-none" />
              <div className="absolute -inset-8 bg-gradient-to-br from-accent/10 via-transparent to-accent/5 rounded-[3rem] blur-2xl pointer-events-none" />

              <motion.img
                src={mobileMockup}
                alt="Мобильное приложение СИНТАГМА — обучение в смартфоне"
                width={1024}
                height={1280}
                loading="lazy"
                className="relative w-[340px] md:w-[400px] h-auto drop-shadow-2xl"
                animate={{ y: [0, -12, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
