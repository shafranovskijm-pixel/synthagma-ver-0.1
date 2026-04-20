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
 * 3. Сгенерируйте hero-фон 16:10 и сохраните в `src/assets/landing-templates/<id>-hero.jpg`,
 *    подставьте его в `data.hero.background_url` через ES6-импорт.
 */
export interface LandingTemplate {
  id: string;
  name: string;
  tagline: string;
  /** @deprecated превью теперь рендерится живым `LandingTemplateMiniPreview` */
  preview_image?: string;
  /** Уникальная обложка шаблона. Имеет приоритет над обложкой курса в превью карточки. */
  cover_image_url?: string;
  accent_color: string;
  /** Лёгкий тинт фона страницы лендинга под нишу (hex). Используется как декоративная подложка секций. */
  surface_tint?: string;
  tier: TemplateTier;
  category?: TemplateCategory;
  is_new?: boolean;
  /** Partial data — поля будут смерджены поверх defaultLanding в useLandingEditor */
  data: Partial<LandingData>;
}
