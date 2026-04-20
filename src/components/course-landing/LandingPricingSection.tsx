import { useLandingTheme } from "./LandingThemeProvider";
import { PricingCards } from "./variants/PricingCards";
import { PricingHighlightMiddle } from "./variants/PricingHighlightMiddle";
import { PricingComparison } from "./variants/PricingComparison";
import { PricingHeroFocus } from "./variants/PricingHeroFocus";
import { PricingLanguageLevels } from "./variants/PricingLanguageLevels";
import { PricingPackageJson } from "./variants/PricingPackageJson";

export interface PricingTier {
  name: string;
  price: number;
  features: string[];
  is_popular: boolean;
}

interface Props {
  title: string;
  tiers: PricingTier[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onTierChange?: (index: number, field: keyof PricingTier, value: any) => void;
  onTierFeatureChange?: (tierIndex: number, featureIndex: number, value: string) => void;
  onAddTierFeature?: (tierIndex: number) => void;
  onRemoveTierFeature?: (tierIndex: number, featureIndex: number) => void;
  onAddTier?: () => void;
  onRemoveTier?: (index: number) => void;
}

/** Диспетчер Pricing — выбирает variant по `theme.pricing_layout`. */
export function LandingPricingSection(props: Props) {
  const { theme } = useLandingTheme();
  const Variant = (() => {
    switch (theme.pricing_layout) {
      case "highlight-middle": return PricingHighlightMiddle;
      case "comparison": return PricingComparison;
      case "hero-focus": return PricingHeroFocus;
      case "language-levels": return PricingLanguageLevels;
      case "package-json": return PricingPackageJson;
      default: return PricingCards;
    }
  })();
  return (
    <div className="landing-bg-pricing">
      <Variant {...props} />
    </div>
  );
}
