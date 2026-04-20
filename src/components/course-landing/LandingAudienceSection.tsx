import { useLandingTheme } from "./LandingThemeProvider";
import { AudienceGrid } from "./variants/AudienceGrid";
import { AudienceIconsRow } from "./variants/AudienceIconsRow";
import { AudienceStackedCards } from "./variants/AudienceStackedCards";
import { AudienceWideFeatureRow } from "./variants/AudienceWideFeatureRow";
import { AudienceSafetyTable } from "./variants/AudienceSafetyTable";
import { AudienceTerminalStrip } from "./variants/AudienceTerminalStrip";
import { AudiencePassportCards } from "./variants/AudiencePassportCards";

export interface AudienceItem {
  icon: string;
  title: string;
  description: string;
}

interface Props {
  title: string;
  description: string;
  items: AudienceItem[];
  isEditing?: boolean;
  onTitleChange?: (v: string) => void;
  onDescriptionChange?: (v: string) => void;
  onItemChange?: (index: number, field: keyof AudienceItem, value: string) => void;
  onAddItem?: () => void;
  onRemoveItem?: (index: number) => void;
}

/** Диспетчер Audience — выбирает variant по `theme.audience_layout`. */
export function LandingAudienceSection(props: Props) {
  const { theme } = useLandingTheme();
  const Variant = (() => {
    switch (theme.audience_layout) {
      case "wide-feature-row": return AudienceWideFeatureRow;
      case "safety-table": return AudienceSafetyTable;
      case "terminal-strip": return AudienceTerminalStrip;
      case "passport-cards": return AudiencePassportCards;
      case "icons-row": return AudienceIconsRow;
      case "stacked-cards": return AudienceStackedCards;
      default: return AudienceGrid;
    }
  })();
  return (
    <div className="landing-bg-section">
      <Variant {...props} />
    </div>
  );
}
