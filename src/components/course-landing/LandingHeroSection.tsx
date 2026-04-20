import { useLandingTheme } from "./LandingThemeProvider";
import { HeroOverlay } from "./variants/HeroOverlay";
import { HeroSplit } from "./variants/HeroSplit";
import { HeroCenteredPhoto } from "./variants/HeroCenteredPhoto";
import { HeroDarkPromo } from "./variants/HeroDarkPromo";

interface LandingHeroProps {
  title: string;
  subtitle: string;
  orgName: string;
  backgroundUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string | null;
  price: number;
  showPrice: boolean;
  lessonsCount: number;
  duration: string | null;
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onSubtitleChange?: (v: string) => void;
  onBackgroundChange?: () => void;
  enrollButton?: React.ReactNode;
  onShowPriceChange?: (v: boolean) => void;
}

/**
 * Диспетчер Hero. Выбирает variant по `theme.hero_layout` из контекста.
 * Если контекста темы нет (старые лендинги) — fallback на «overlay».
 */
export function LandingHeroSection(props: LandingHeroProps) {
  const { theme } = useLandingTheme();
  switch (theme.hero_layout) {
    case "split-right":
      return <HeroSplit {...props} side="right" />;
    case "split-left":
      return <HeroSplit {...props} side="left" />;
    case "centered-photo":
      return <HeroCenteredPhoto {...props} />;
    case "dark-promo":
      return <HeroDarkPromo {...props} />;
    case "overlay":
    default:
      return <HeroOverlay {...props} />;
  }
}
