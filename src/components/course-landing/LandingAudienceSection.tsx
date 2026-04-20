import { useLandingTheme } from "./LandingThemeProvider";
import { AudienceGrid } from "./variants/AudienceGrid";
import { AudienceIconsRow } from "./variants/AudienceIconsRow";
import { AudienceStackedCards } from "./variants/AudienceStackedCards";

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

/** Диспетчер Audience. Выбирает variant по `theme.audience_layout`. */
export function LandingAudienceSection(props: Props) {
  const { theme } = useLandingTheme();
  const Variant =
    theme.audience_layout === "icons-row"
      ? AudienceIconsRow
      : theme.audience_layout === "stacked-cards"
      ? AudienceStackedCards
      : AudienceGrid;
  return (
    <div className="landing-bg-section">
      <Variant {...props} />
    </div>
  );
}
