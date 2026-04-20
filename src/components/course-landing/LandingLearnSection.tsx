import { useLandingTheme } from "./LandingThemeProvider";
import { LearnIconCards } from "./variants/learn/LearnIconCards";
import { LearnAuroraNumbers } from "./variants/learn/LearnAuroraNumbers";
import { LearnBeautyPolaroids } from "./variants/learn/LearnBeautyPolaroids";
import { LearnSafetyChecklist } from "./variants/learn/LearnSafetyChecklist";
import { LearnLabTerminal } from "./variants/learn/LearnLabTerminal";
import { LearnLanguageBook } from "./variants/learn/LearnLanguageBook";
import type { LearnVariantProps } from "./variants/learn/types";

export interface LearnItem {
  icon: string;
  title: string;
  description: string;
}

/**
 * Диспетчер «Что вы освоите». Выбирает variant по `theme.learn_layout`.
 * Если поле не задано — рендерит базовый `LearnIconCards`
 * (двухколоночная сетка карточек с иконками).
 */
export function LandingLearnSection(props: LearnVariantProps) {
  const { theme } = useLandingTheme();
  const layout = theme.learn_layout ?? "icon-cards";

  const Variant =
    layout === "aurora-numbers"     ? LearnAuroraNumbers   :
    layout === "beauty-polaroids"   ? LearnBeautyPolaroids :
    layout === "safety-checklist"   ? LearnSafetyChecklist :
    layout === "lab-terminal"       ? LearnLabTerminal     :
    layout === "language-book"      ? LearnLanguageBook    :
    LearnIconCards;

  return <Variant {...props} />;
}
