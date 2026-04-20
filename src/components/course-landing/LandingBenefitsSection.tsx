import { useLandingTheme } from "./LandingThemeProvider";
import { BenefitsGrid } from "./variants/BenefitsGrid";
import { BenefitsIconList } from "./variants/BenefitsIconList";

export interface BenefitItem {
  icon: string;
  title: string;
  description: string;
}

interface Props {
  benefits: BenefitItem[];
  isEditing?: boolean;
  onBenefitChange?: (index: number, field: "title" | "description" | "icon", value: string) => void;
  onAddBenefit?: () => void;
  onRemoveBenefit?: (index: number) => void;
}

/** Диспетчер Benefits. Выбирает variant по `theme.benefits_layout`. */
export function LandingBenefitsSection(props: Props) {
  const { theme } = useLandingTheme();
  const Variant = theme.benefits_layout === "icon-list" ? BenefitsIconList : BenefitsGrid;
  return (
    <div className="landing-bg-section">
      <Variant {...props} />
    </div>
  );
}
