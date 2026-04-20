import { useLandingTheme } from "./LandingThemeProvider";
import { BenefitsGrid } from "./variants/BenefitsGrid";
import { BenefitsIconList } from "./variants/BenefitsIconList";
import { BenefitsPetals } from "./variants/BenefitsPetals";
import { BenefitsBlueprintList } from "./variants/BenefitsBlueprintList";
import { BenefitsCodeStack } from "./variants/BenefitsCodeStack";
import { BenefitsRouteStamps } from "./variants/BenefitsRouteStamps";

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

/** Диспетчер Benefits — выбирает variant по `theme.benefits_layout`. */
export function LandingBenefitsSection(props: Props) {
  const { theme } = useLandingTheme();
  const Variant = (() => {
    switch (theme.benefits_layout) {
      case "petals": return BenefitsPetals;
      case "blueprint-list": return BenefitsBlueprintList;
      case "code-stack": return BenefitsCodeStack;
      case "route-stamps": return BenefitsRouteStamps;
      case "icon-list": return BenefitsIconList;
      default: return BenefitsGrid;
    }
  })();
  return (
    <div className="landing-bg-section">
      <Variant {...props} />
    </div>
  );
}
