import { Flame, HardHat, Zap, Factory, Droplets, TrendingUp } from "lucide-react";
import heroFire from "@/assets/marketplace/hero-fire-safety.jpg";
import heroLabor from "@/assets/marketplace/hero-labor-safety.jpg";
import heroMedicine from "@/assets/marketplace/hero-medicine.jpg";
import heroElectrical from "@/assets/marketplace/hero-electrical.jpg";
import heroIndustrial from "@/assets/marketplace/hero-industrial.jpg";

interface HeroCard {
  title: string;
  subtitle: string;
  image: string;
  icon: React.ElementType;
  gradient: string;
}

const HERO_CARDS: HeroCard[] = [
  { title: "Специалист по пожарной профилактике", subtitle: "Профпереподготовка", image: heroFire, icon: Flame, gradient: "from-red-500/80 to-orange-500/80" },
  { title: "Обращение с отходами I-IV классов", subtitle: "Профессиональная подготовка", image: heroLabor, icon: Droplets, gradient: "from-teal-500/80 to-cyan-500/80" },
  { title: "Охрана труда для руководителей", subtitle: "Повышение квалификации", image: heroMedicine, icon: HardHat, gradient: "from-amber-500/80 to-yellow-500/80" },
  { title: "Электробезопасность до 1000В", subtitle: "Группы допуска", image: heroElectrical, icon: Zap, gradient: "from-yellow-500/80 to-lime-500/80" },
  { title: "Промышленная безопасность А.1", subtitle: "Аттестация специалистов", image: heroIndustrial, icon: Factory, gradient: "from-orange-500/80 to-red-400/80" },
];

interface MarketplaceHeroCardsProps {
  onCardClick?: (courseTitle: string) => void;
}

export function MarketplaceHeroCards({ onCardClick }: MarketplaceHeroCardsProps) {
  return (
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
              onClick={() => onCardClick?.(card.title)}
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
  );
}
