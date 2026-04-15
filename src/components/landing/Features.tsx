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
} from "lucide-react";
import { Link } from "react-router-dom";

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
    description: "Современный редактор с ИИ для создания интерактивных курсов.",
    link: "/feature/ai-courses",
    bg: coursesBg,
  },
  {
    icon: Settings,
    title: "Настройки курсов",
    description: "Запрет перемотки видео, последовательное прохождение, напоминания.",
    link: "/feature/course-settings",
    bg: settingsBg,
  },
  {
    icon: ShoppingCart,
    title: "Магазин курсов",
    description: "Дополнительный канал продаж — курсы видны всем ученикам.",
    link: "/feature/course-store",
    bg: storeBg,
    hasScreenshot: true,
  },
  {
    icon: Video,
    title: "Вебинары",
    description: "Живые трансляции через Kinescope Live. Запись и аналитика.",
    bg: webinarsBg,
  },
  {
    icon: FileSearch,
    title: "Чек-лист документов",
    description: "Сбор и хранение документов слушателей.",
    link: "/feature/document-checklist",
    bg: checklistBg,
  },
  {
    icon: Smartphone,
    title: "Видеоидентификация",
    description: "Подтверждение личности слушателя перед обучением.",
    link: "/feature/video-id",
    bg: videoidBg,
  },
  {
    icon: HardHat,
    title: "Охрана труда",
    description: "Обучение с протоколами и подписями комиссии.",
    link: "/feature/labor-safety",
    bg: safetyBg,
  },
  {
    icon: FileCheck,
    title: "Документооборот",
    description: "Договоры, счета, акты — формируются автоматически.",
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
    description: "Массовый импорт, рассылка логинов, сбор документов.",
    bg: studentsBg,
  },
];

export function Features() {
  const doubled = [...features, ...features];

  return (
    <section id="features" className="relative overflow-hidden py-20 md:py-28">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/30 to-background" />

      {/* Title overlay */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
        <div className="text-center px-6 py-8 rounded-3xl bg-background/70 backdrop-blur-xl border border-border/30 shadow-2xl max-w-lg">
          <span className="text-sm text-accent font-medium tracking-widest uppercase mb-3 block">
            Платформа
          </span>
          <h2 className="font-display text-3xl md:text-5xl font-medium mb-4 tracking-tight">
            Инструменты для обучения
          </h2>
          <div className="divider mb-4" />
          <p className="text-base text-muted-foreground">
            Полный набор инструментов для дистанционного обучения и документооборота
          </p>
        </div>
      </div>

      {/* Marquee */}
      <div
        className="relative z-10 group"
        style={{ maskImage: 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)' }}
      >
        <div
          className="flex gap-4 md:gap-6 w-max animate-marquee group-hover:[animation-play-state:paused]"
        >
          {doubled.map((feature, i) => (
            <FeatureCard key={`${feature.title}-${i}`} feature={feature} />
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
      <div className="relative rounded-2xl overflow-hidden h-[300px] md:h-[360px] w-[280px] md:w-[380px] flex-shrink-0 cursor-pointer group/card">
        {/* Background image */}
        <img
          src={feature.bg}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/card:scale-110"
        />
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20 group-hover/card:from-black/95 group-hover/card:via-black/60 transition-all duration-500" />

        {/* Marketplace screenshot */}
        {feature.hasScreenshot && (
          <div className="absolute bottom-16 right-3 w-32 h-20 rounded-lg overflow-hidden border border-white/10 shadow-xl opacity-70 group-hover/card:opacity-100 transition-opacity duration-500 rotate-2">
            <img
              src={screenshotMarketplace}
              alt="Магазин курсов"
              loading="lazy"
              className="w-full h-full object-cover object-top"
            />
          </div>
        )}

        {/* Content */}
        <div className="absolute inset-0 p-5 md:p-6 flex flex-col justify-end z-10">
          <div className="mb-3">
            <div className="w-11 h-11 rounded-xl bg-accent/20 backdrop-blur-sm border border-accent/30 flex items-center justify-center group-hover/card:bg-accent/30 group-hover/card:border-accent/50 transition-all duration-500">
              <feature.icon className="w-5 h-5 text-accent" />
            </div>
          </div>
          <h3 className="font-display text-lg md:text-xl font-medium text-white mb-1.5 group-hover/card:text-accent transition-colors duration-300">
            {feature.title}
          </h3>
          <p className="text-white/70 text-sm leading-relaxed group-hover/card:text-white/90 transition-colors duration-300">
            {feature.description}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="h-0.5 w-0 group-hover/card:w-12 bg-gradient-to-r from-accent to-accent/30 rounded-full transition-all duration-500 ease-out" />
            {feature.link && (
              <span className="text-xs text-accent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 flex items-center gap-1">
                Подробнее <ArrowRight className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </div>
    </Wrapper>
  );
}
