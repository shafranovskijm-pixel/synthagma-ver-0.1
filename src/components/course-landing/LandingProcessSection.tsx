import { useLandingTheme } from "./LandingThemeProvider";
import { ProcessNumberedList } from "./variants/process/ProcessNumberedList";
import { ProcessAuroraTimeline } from "./variants/process/ProcessAuroraTimeline";
import { ProcessBeautySteps } from "./variants/process/ProcessBeautySteps";
import { ProcessSafetyBlueprint } from "./variants/process/ProcessSafetyBlueprint";
import { ProcessLabAscii } from "./variants/process/ProcessLabAscii";
import { ProcessLanguageRoute } from "./variants/process/ProcessLanguageRoute";
import type { ProcessVariantProps } from "./variants/process/types";

/**
 * Диспетчер «Как проходит обучение». Выбирает variant по `theme.process_layout`.
 * Если поле не задано — рендерит базовый нумерованный список.
 */
export function LandingProcessSection(props: ProcessVariantProps) {
  const { theme } = useLandingTheme();
  const layout = theme.process_layout ?? "numbered-list";

  const Variant =
    layout === "aurora-timeline"   ? ProcessAuroraTimeline  :
    layout === "beauty-steps"      ? ProcessBeautySteps     :
    layout === "safety-blueprint"  ? ProcessSafetyBlueprint :
    layout === "lab-ascii"         ? ProcessLabAscii        :
    layout === "language-route"    ? ProcessLanguageRoute   :
    ProcessNumberedList;

  return <Variant {...props} />;
}
