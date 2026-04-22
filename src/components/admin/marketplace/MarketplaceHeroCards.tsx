import { Flame, HardHat, Zap, Factory, Droplets, TrendingUp, Sparkles, Scale, Megaphone, Calculator, UserCog, ShieldCheck, Heart } from "lucide-react";
import heroFire from "@/assets/marketplace/hero-fire-safety.jpg";
import heroLabor from "@/assets/marketplace/hero-labor-safety.jpg";
import heroMedicine from "@/assets/marketplace/hero-medicine.jpg";
import heroElectrical from "@/assets/marketplace/hero-electrical.jpg";
import heroIndustrial from "@/assets/marketplace/hero-industrial.jpg";
import newJurist from "@/assets/marketplace/new-jurist.jpg";
import newMarketing from "@/assets/marketplace/new-marketing.jpg";
import newAccountant from "@/assets/marketplace/new-accountant.jpg";
import newHr from "@/assets/marketplace/new-hr.jpg";
import newLaborSafety from "@/assets/marketplace/new-labor-safety-spec.jpg";
import newPsychologist from "@/assets/marketplace/new-psychologist.jpg";

interface HeroCard {
  title: string;
  subtitle: string;
  searchTitle: string;
  image: string;
  icon: React.ElementType;
  gradient: string;
}

const NEW_CARDS: HeroCard[] = [
  {
    title: "Юрист",
    subtitle: "Договорная и претензионная работа",
    searchTitle: "Юрист: договорная и претензионная работа",
    image: newJurist,
    icon: Scale,
    gradient: "from-slate-600/80 to-indigo-600/80",
  },
  {
    title: "Маркетолог",
    subtitle: "Digital и классический маркетинг",
    searchTitle: "Менеджер по маркетингу: digital и классический",
    image: newMarketing,
    icon: Megaphone,
    gradient: "from-pink-500/80 to-rose-500/80",
  },
  {
    title: "Бухгалтер",
    subtitle: "Учёт, налоги и отчётность",
    searchTitle: "Бухгалтер: учёт, налоги и отчётность",
    image: newAccountant,
    icon: Calculator,
    gradient: "from-emerald-500/80 to-teal-500/80",
  },
  {
    title: "HR-менеджер",
    subtitle: "Управление персоналом",
    searchTitle: "HR-менеджер: управление персоналом",
    image: newHr,
    icon: UserCog,
    gradient: "from-violet-500/80 to-purple-500/80",
  },
  {
    title: "Охрана труда",
    subtitle: "Специалист по охране труда",
    searchTitle: "Специалист по охране труда",
    image: newLaborSafety,
    icon: ShieldCheck,
    gradient: "from-amber-500/80 to-orange-500/80",
  },
  {
    title: "Психолог-консультант",
    subtitle: "Консультативная психология",
    searchTitle: "Психолог-консультант",
    image: newPsychologist,
    icon: Heart,
    gradient: "from-fuchsia-500/80 to-pink-500/80",
  },
];

const HERO_CARDS: HeroCard[] = [
  {
    title: "Специалист по пожарной профилактике",
    subtitle: "Профпереподготовка",
    searchTitle: "Профессиональная переподготовка для получения квалификации «Специалист по пожарной профилактике»",
    image: heroFire,
    icon: Flame,
    gradient: "from-red-500/80 to-orange-500/80",
  },
  {
    title: "Обращение с отходами I-IV классов",
    subtitle: "Профессиональная подготовка",
    searchTitle: "Профессиональная подготовка лиц допущенных к обращению с отходами I-IV классов опасности",
    image: heroLabor,
    icon: Droplets,
    gradient: "from-teal-500/80 to-cyan-500/80",
  },
  {
    title: "Охрана труда при работах на высоте",
    subtitle: "Повышение квалификации",
    searchTitle: "Охрана труда при работах на высоте",
    image: heroMedicine,
    icon: HardHat,
    gradient: "from-amber-500/80 to-yellow-500/80",
  },
  {
    title: "Пожарная безопасность",
    subtitle: "Обучение руководителей",
    searchTitle: "Обучение мерам пожарной безопасности руководителей организаций",
    image: heroElectrical,
    icon: Zap,
    gradient: "from-yellow-500/80 to-lime-500/80",
  },
  {
    title: "Промышленная безопасность",
    subtitle: "Общие требования",
    searchTitle: "Общие требования промышленной безопасности",
    image: heroIndustrial,
    icon: Factory,
    gradient: "from-orange-500/80 to-red-400/80",
  },
];

interface MarketplaceHeroCardsProps {
  onCardClick?: (courseTitle: string) => void;
}

export function MarketplaceHeroCards({ onCardClick }: MarketplaceHeroCardsProps) {
  return (
    <div className="space-y-5">
      {/* НОВЫЕ КУРСЫ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-warning" />
          <h3 className="text-lg font-semibold">Новые курсы</h3>
          <span className="text-[10px] uppercase tracking-wider font-bold bg-warning/15 text-warning px-2 py-0.5 rounded-full">
            Только что добавлено
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {NEW_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.title}
                onClick={() => onCardClick?.(card.searchTitle)}
                className="group relative rounded-2xl overflow-hidden aspect-[4/3] border border-border hover:shadow-lg transition-all"
              >
                <img
                  src={card.image}
                  alt={card.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  width={768}
                  height={512}
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${card.gradient} via-black/40 to-transparent`} />
                {/* NEW бейдж */}
                <div className="absolute top-1.5 right-1.5 bg-warning text-warning-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md">
                  NEW
                </div>
                <div className="absolute inset-0 flex flex-col justify-end p-2.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className="w-3.5 h-3.5 text-white drop-shadow" />
                    <span className="text-white text-[11px] font-bold drop-shadow line-clamp-1">{card.title}</span>
                  </div>
                  <span className="text-white/80 text-[10px] drop-shadow line-clamp-1">{card.subtitle}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ПОПУЛЯРНЫЕ КУРСЫ */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Популярные курсы</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {HERO_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.title}
                onClick={() => onCardClick?.(card.searchTitle)}
                className="group relative rounded-2xl overflow-hidden aspect-[4/3] border border-border hover:shadow-lg transition-all"
              >
                <img
                  src={card.image}
                  alt={card.title}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  width={768}
                  height={512}
                />
                <div className={`absolute inset-0 bg-gradient-to-t ${card.gradient} via-black/40 to-transparent`} />
                <div className="absolute inset-0 flex flex-col justify-end p-3">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className="w-4 h-4 text-white drop-shadow" />
                    <span className="text-white text-xs font-bold drop-shadow line-clamp-1">{card.title}</span>
                  </div>
                  <span className="text-white/80 text-[10px] drop-shadow line-clamp-1">{card.subtitle}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
