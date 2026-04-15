import {
  BookOpen,
  Users,
  Building2,
  FileCheck,
  ClipboardList,
  Database,
  Settings,
  ShoppingCart,
  FileSearch,
  Video,
  HardHat,
  Smartphone,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";

import coursesBg from "@/assets/features/courses-bg.jpg";
import settingsBg from "@/assets/features/settings-bg.jpg";
import storeBg from "@/assets/features/store-bg.jpg";
import webinarsBg from "@/assets/features/webinars-bg.jpg";
import checklistBg from "@/assets/features/checklist-bg.jpg";
import videoidBg from "@/assets/features/videoid-bg.jpg";
import safetyBg from "@/assets/features/safety-bg.jpg";
import documentsBg from "@/assets/features/documents-bg.jpg";
import frdoBg from "@/assets/features/frdo-bg.jpg";
import studentsBg from "@/assets/features/students-bg.jpg";
import screenshotMarketplace from "@/assets/presentation/screenshot-marketplace.png";

const features = [
  {
    icon: BookOpen,
    title: "Управление курсами",
    description: "Современный редактор с ИИ для создания интерактивных курсов. Импорт с любых платформ.",
    link: "/feature/ai-courses",
    bg: coursesBg,
  },
  {
    icon: Settings,
    title: "Настройки курсов",
    description: "Запрет перемотки видео, последовательное прохождение уроков, напоминания и сбор данных.",
    link: "/feature/course-settings",
    bg: settingsBg,
  },
  {
    icon: ShoppingCart,
    title: "Магазин курсов",
    description: "Дополнительный канал продаж — ваши курсы видны всем ученикам платформы.",
    link: "/feature/course-store",
    bg: storeBg,
    hasScreenshot: true,
  },
  {
    icon: Video,
    title: "Вебинары",
    description: "Проводите живые трансляции через Kinescope Live или внешние платформы. Запись и аналитика.",
    bg: webinarsBg,
  },
  {
    icon: FileSearch,
    title: "Чек-лист документов",
    description: "Сбор и хранение документов слушателей. Упрощение проверок Рособрнадзора.",
    link: "/feature/document-checklist",
    bg: checklistBg,
  },
  {
    icon: Smartphone,
    title: "Видеоидентификация",
    description: "Подтверждение личности слушателя перед началом обучения.",
    link: "/feature/video-id",
    bg: videoidBg,
  },
  {
    icon: HardHat,
    title: "Охрана труда",
    description: "Обучение охране труда с протоколами и подписями комиссии.",
    link: "/feature/labor-safety",
    bg: safetyBg,
  },
  {
    icon: FileCheck,
    title: "Документооборот",
    description: "Договоры, счета, акты, приказы — формируются автоматически.",
    link: "/feature/documents",
    bg: documentsBg,
  },
  {
    icon: Database,
    title: "ФИС ФРДО",
    description: "Автоматическая выгрузка данных о выданных документах.",
    link: "/feature/frdo",
    bg: frdoBg,
  },
  {
    icon: Users,
    title: "Слушатели",
    description: "Массовый импорт, автоматическая рассылка логинов. Сбор документов через личный кабинет.",
    bg: studentsBg,
  },
];

const VISIBLE_DESKTOP = 3;
const VISIBLE_MOBILE = 1;
const AUTO_INTERVAL = 4000;

export function Features() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const total = features.length;

  const next = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % total);
  }, [total]);

  const prev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(next, AUTO_INTERVAL);
    return () => clearInterval(timer);
  }, [isPaused, next]);

  const getVisibleFeatures = (count: number) => {
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(features[(currentIndex + i) % total]);
    }
    return result;
  };

  return (
    <section id="features" className="section-padding relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/30 to-background" />
      <div className="absolute inset-0 opacity-[0.012]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px'
      }} />
      <div className="absolute top-[5%] right-[3%] w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[8%] left-[5%] w-72 h-72 bg-accent/4 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <span className="text-sm text-accent font-medium tracking-widest uppercase mb-4 block">
            Платформа
          </span>
          <h2 className="font-display text-4xl md:text-5xl font-medium mb-6 tracking-tight">
            Инструменты для обучения
          </h2>
          <div className="divider mb-6" />
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Полный набор инструментов для дистанционного обучения и документооборота
          </p>
        </motion.div>

        {/* Carousel */}
        <div
          className="relative"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Navigation arrows */}
          <button
            onClick={prev}
            className="absolute -left-4 md:-left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 flex items-center justify-center hover:bg-card hover:border-accent/40 transition-all duration-300 shadow-lg"
          >
            <ChevronLeft className="w-5 h-5 text-foreground/70" />
          </button>
          <button
            onClick={next}
            className="absolute -right-4 md:-right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-card/80 backdrop-blur-sm border border-border/50 flex items-center justify-center hover:bg-card hover:border-accent/40 transition-all duration-300 shadow-lg"
          >
            <ChevronRight className="w-5 h-5 text-foreground/70" />
          </button>

          {/* Desktop carousel */}
          <div className="hidden md:block overflow-hidden">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -80 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="grid grid-cols-3 gap-6"
            >
              {getVisibleFeatures(VISIBLE_DESKTOP).map((feature) => (
                <FeatureCard key={feature.title} feature={feature} />
              ))}
            </motion.div>
          </div>

          {/* Mobile carousel */}
          <div className="md:hidden overflow-hidden">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {getVisibleFeatures(VISIBLE_MOBILE).map((feature) => (
                <FeatureCard key={feature.title} feature={feature} />
              ))}
            </motion.div>
          </div>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-2 mt-10">
          {features.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`transition-all duration-300 rounded-full ${
                index === currentIndex
                  ? "w-8 h-2 bg-accent"
                  : "w-2 h-2 bg-border hover:bg-muted-foreground/50"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: typeof features[0] }) {
  const Wrapper = feature.link ? Link : "div";
  const wrapperProps = feature.link ? { to: feature.link } : {};

  return (
    <Wrapper {...(wrapperProps as any)}>
      <div className="group relative rounded-2xl overflow-hidden h-[340px] cursor-pointer">
        {/* Background image */}
        <img
          src={feature.bg}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20 group-hover:from-black/95 group-hover:via-black/60 transition-all duration-500" />

        {/* Marketplace screenshot for store card */}
        {feature.hasScreenshot && (
          <div className="absolute bottom-16 right-3 w-32 h-20 rounded-lg overflow-hidden border border-white/10 shadow-xl opacity-70 group-hover:opacity-100 transition-opacity duration-500 rotate-2">
            <img
              src={screenshotMarketplace}
              alt="Магазин курсов"
              loading="lazy"
              className="w-full h-full object-cover object-top"
            />
          </div>
        )}

        {/* Content */}
        <div className="absolute inset-0 p-6 flex flex-col justify-end relative z-10">
          {/* Icon */}
          <div className="mb-4">
            <div className="w-12 h-12 rounded-xl bg-accent/20 backdrop-blur-sm border border-accent/30 flex items-center justify-center group-hover:bg-accent/30 group-hover:border-accent/50 transition-all duration-500">
              <feature.icon className="w-6 h-6 text-accent" />
            </div>
          </div>

          <h3 className="font-display text-xl font-medium text-white mb-2 group-hover:text-accent transition-colors duration-300">
            {feature.title}
          </h3>
          <p className="text-white/70 text-sm leading-relaxed group-hover:text-white/90 transition-colors duration-300">
            {feature.description}
          </p>

          {/* Bottom accent */}
          <div className="mt-4 flex items-center gap-2">
            <div className="h-0.5 w-0 group-hover:w-12 bg-gradient-to-r from-accent to-accent/30 rounded-full transition-all duration-500 ease-out" />
            {feature.link && (
              <span className="text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-center gap-1">
                Подробнее <ArrowRight className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </Wrapper>
  );
}
