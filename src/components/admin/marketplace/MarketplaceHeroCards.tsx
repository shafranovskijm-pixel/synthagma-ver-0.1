import { Sparkles, BookOpen, UserCog, Scale, Flame, GraduationCap } from "lucide-react";
import heroFire from "@/assets/demo/course-fire.jpg";
import newJurist from "@/assets/demo/demo-feature-constructor.jpg";
import newMarketing from "@/assets/presentation/ai-assistant-bg.jpg";
import newAccountant from "@/assets/cover_44fz.jpg";
import newHr from "@/assets/marketplace/new-hr.jpg";
import newLaborSafety from "@/assets/features/courses-bg.jpg";
import { RECOMMENDED_PLATFORM_COURSES } from "@/lib/platformCourseCatalog";

const CARD_STYLES = [
  { image: newMarketing, icon: Sparkles, gradient: "from-pink-500/80 to-rose-500/80" },
  { image: newJurist, icon: BookOpen, gradient: "from-slate-600/80 to-indigo-600/80" },
  { image: newHr, icon: UserCog, gradient: "from-violet-500/80 to-purple-500/80" },
  { image: newAccountant, icon: Scale, gradient: "from-emerald-500/80 to-teal-500/80" },
  { image: heroFire, icon: Flame, gradient: "from-red-500/80 to-orange-500/80" },
  { image: newLaborSafety, icon: GraduationCap, gradient: "from-amber-500/80 to-orange-500/80" },
];

interface MarketplaceHeroCardsProps {
  /** The admin catalogue keeps its existing title-search callback. */
  onCardClick?: (courseTitle: string) => void;
  onCourseClick?: (courseId: string) => void;
  /** Organization catalogue supplies only currently proven platform listings. */
  availableCourseIds?: readonly string[];
}

export function MarketplaceHeroCards({ onCardClick, onCourseClick, availableCourseIds }: MarketplaceHeroCardsProps) {
  const cards = RECOMMENDED_PLATFORM_COURSES.map((course, index) => ({ ...course, ...CARD_STYLES[index] }))
    .filter(course => !availableCourseIds || availableCourseIds.filter(id => id === course.courseId).length === 1);
  if (!cards.length) return null;
  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-3xl border-2 border-warning/30 bg-gradient-to-br from-warning/5 via-background to-primary/5 p-4 sm:p-5 shadow-md">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-warning/15 ring-1 ring-warning/30">
            <Sparkles className="w-5 h-5 text-warning" />
          </div>
          <h3 className="text-xl font-bold text-foreground">Рекомендуем начать</h3>
          <span className="text-[10px] uppercase tracking-wider font-bold bg-warning text-warning-foreground px-2.5 py-1 rounded-full shadow-sm">
            Подборка платформы
          </span>
          <span className="ml-auto text-xs text-muted-foreground hidden sm:inline">Собственные курсы — бесплатно</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <button
                key={card.courseId}
                onClick={() => onCourseClick ? onCourseClick(card.courseId) : onCardClick?.(card.fullTitle)}
                className="group relative rounded-2xl overflow-hidden aspect-[16/10] border border-border hover:shadow-xl hover:-translate-y-0.5 transition-all"
              >
                <img src={card.image} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" width={768} height={480} />
                <div className={`absolute inset-0 bg-gradient-to-t ${card.gradient} via-black/50 to-transparent`} />
                <div className="absolute inset-0 flex flex-col justify-end p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-4 h-4 text-white drop-shadow" />
                    <span className="text-white text-sm font-bold drop-shadow line-clamp-1">{card.title}</span>
                  </div>
                  <span className="text-white/85 text-[11px] drop-shadow line-clamp-2">{card.fullTitle}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
