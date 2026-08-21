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
  Mail,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";

const features = [
  {
    icon: BookOpen,
    title: "Управление курсами",
    description: "Современный редактор с ИИ для создания интерактивных курсов.",
    link: "/feature/ai-courses",
    gradient: "from-cyan-500/25 via-sky-500/10 to-transparent",
  },
  {
    icon: Settings,
    title: "Настройки курсов",
    description: "Запрет перемотки видео, последовательное прохождение, напоминания.",
    link: "/feature/course-settings",
    gradient: "from-violet-500/25 via-indigo-500/10 to-transparent",
  },
  {
    icon: ShoppingCart,
    title: "Магазин курсов",
    description: "Дополнительный канал продаж — курсы видны всем ученикам.",
    link: "/feature/course-store",
    gradient: "from-amber-500/25 via-orange-500/10 to-transparent",
  },
  {
    icon: Video,
    title: "Вебинары",
    description: "Встроенные эфиры LiveKit и подключение внешних трансляций.",
    gradient: "from-rose-500/25 via-pink-500/10 to-transparent",
  },
  {
    icon: FileSearch,
    title: "Чек-лист документов",
    description: "Сбор и хранение документов слушателей.",
    link: "/feature/document-checklist",
    gradient: "from-emerald-500/25 via-teal-500/10 to-transparent",
  },
  {
    icon: Smartphone,
    title: "Видеоидентификация",
    description: "Фотофиксация слушателя с ручной проверкой результата администратором.",
    link: "/feature/video-id",
    gradient: "from-blue-500/25 via-cyan-500/10 to-transparent",
  },
  {
    icon: HardHat,
    title: "Охрана труда",
    description: "Обучение с протоколами и подписями комиссии.",
    link: "/feature/labor-safety",
    gradient: "from-yellow-500/25 via-amber-500/10 to-transparent",
  },
  {
    icon: FileCheck,
    title: "Документооборот",
    description: "Договоры, счета и акты формируются из реквизитов организации и клиента.",
    link: "/feature/documents",
    gradient: "from-slate-400/25 via-zinc-400/10 to-transparent",
  },
  {
    icon: Database,
    title: "ФИС ФРДО",
    description: "Подготовка XLSX-файлов по выданным документам для последующей загрузки в ФИС ФРДО.",
    link: "/feature/frdo",
    gradient: "from-fuchsia-500/25 via-purple-500/10 to-transparent",
  },
  {
    icon: Mail,
    title: "Email-рассылки",
    description: "Свой SMTP, шаблоны, drip-цепочки, A/B-тесты тем и трекинг открытий.",
    link: "/feature/email-campaigns",
    gradient: "from-sky-500/25 via-blue-500/10 to-transparent",
  },
  {
    icon: TrendingUp,
    title: "CRM и Продажи",
    description: "Канбан сделок, КП с PDF, договоры с ПЭП, счета и лидерборд менеджеров.",
    link: "/feature/sales-crm",
    gradient: "from-lime-500/25 via-emerald-500/10 to-transparent",
  },
  {
    icon: Users,
    title: "Слушатели",
    description: "Массовый импорт, рассылка логинов, сбор документов.",
    gradient: "from-indigo-500/25 via-violet-500/10 to-transparent",
  },
];

export function Features() {
  const doubled = [...features, ...features];

  return (
    <section id="features" className="relative overflow-hidden py-20 md:py-28">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-secondary/30 to-background" />

      {/* Title overlay */}
      <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none px-4">
        <div className="text-center px-6 py-8 rounded-3xl bg-background/70 backdrop-blur-xl border border-border/30 shadow-2xl max-w-xl">
          <span className="text-sm text-accent font-medium tracking-widest uppercase mb-3 block">
            Платформа
          </span>
          <h2 className="font-display text-2xl md:text-4xl font-medium mb-4 tracking-tight leading-tight">
            Все инструменты учебного центра в одной платформе
          </h2>
          <div className="divider mb-4" />
          <p className="text-sm md:text-base text-muted-foreground">
            Дистанционное обучение, документооборот, видеоидентификация, ФИС ФРДО и контроль
            прохождения — без разрозненных сервисов.
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
        {/* Code-native visual: this is a feature card, not a product screenshot. */}
        <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient}`} />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full border border-accent/15 bg-accent/5 transition-transform duration-700 group-hover/card:scale-110" />
        <div className="absolute right-10 top-12 flex h-24 w-24 items-center justify-center rounded-3xl border border-border/40 bg-card/40 backdrop-blur-sm transition-transform duration-500 group-hover/card:-translate-y-1 group-hover/card:rotate-3">
          <feature.icon className="h-12 w-12 text-accent/60" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="absolute inset-0 p-5 md:p-6 flex flex-col justify-end z-10">
          <div className="mb-3">
            <div className="w-11 h-11 rounded-xl bg-accent/20 backdrop-blur-sm border border-accent/30 flex items-center justify-center group-hover/card:bg-accent/30 group-hover/card:border-accent/50 transition-all duration-500">
              <feature.icon className="w-5 h-5 text-accent" />
            </div>
          </div>
          <h3 className="font-display text-lg md:text-xl font-medium text-foreground mb-1.5 group-hover/card:text-accent transition-colors duration-300">
            {feature.title}
          </h3>
          <p className="text-muted-foreground text-sm leading-relaxed group-hover/card:text-foreground/90 transition-colors duration-300">
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
