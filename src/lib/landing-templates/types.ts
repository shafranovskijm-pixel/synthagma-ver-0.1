import type { LandingData } from "@/hooks/useLandingEditor";

export type TemplateTier = "free" | "pro" | "premium";

export type TemplateCategory =
  | "business"
  | "beauty"
  | "edu"
  | "lang"
  | "it"
  | "safety";

/**
 * Как добавить новый шаблон лендинга:
 * 1. Создайте файл `src/lib/landing-templates/<id>.ts` и экспортируйте `LandingTemplate`.
 * 2. Зарегистрируйте его в массиве `LANDING_TEMPLATES` в `src/lib/landing-templates/index.ts`.
 * 3. Сохраните превью-картинку 16:10 в `src/assets/landing-templates/<id>.jpg`.
 */
export interface LandingTemplate {
  id: string;
  name: string;
  tagline: string;
  /** @deprecated превью теперь рендерится живым `LandingTemplateMiniPreview` */
  preview_image?: string;
  accent_color: string;
  tier: TemplateTier;
  category?: TemplateCategory;
  is_new?: boolean;
  /** Partial data — поля будут смерджены поверх defaultLanding в useLandingEditor */
  data: Partial<LandingData>;
}
