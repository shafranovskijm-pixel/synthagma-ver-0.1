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
 * Глобальная тема оформления шаблона. Управляет шрифтами, формами, декором
 * и переключает варианты рендера ключевых секций. Используется везде, где
 * лендинг рендерится — в публичной странице, в редакторе и в галерее превью.
 */
export interface LandingTheme {
  /**
   * Идентификатор шаблона-источника. Заполняется при применении шаблона
   * и используется хуком `useTemplateStyle()` для подбора уникальных
   * CSS-скинов карточек/кнопок (см. `templateStyles.ts`).
   * Опционален — обратная совместимость со старыми сохранёнными темами.
   */
  template_id?: string;
  font_heading: "inter" | "manrope" | "playfair" | "unbounded" | "jetbrains";
  font_body: "inter" | "manrope" | "pt-serif";
  /** 0 / 16px / 9999 — резкие, мягкие, пилюли */
  radius: "sharp" | "soft" | "pill";
  button_style: "solid" | "outline" | "gradient" | "neon";
  card_style: "flat" | "shadow" | "glass" | "bordered";
  /** Декоративный паттерн фона страницы */
  decor: "none" | "dots" | "grid" | "noise" | "aurora" | "sparkles";
  section_spacing: "compact" | "normal" | "roomy";
  hero_layout: "overlay" | "split-right" | "split-left" | "centered-photo" | "dark-promo";
  pricing_layout: "cards" | "comparison" | "highlight-middle";
  audience_layout: "grid" | "icons-row" | "stacked-cards";
  reviews_layout: "cards" | "masonry" | "carousel-mini";
  benefits_layout: "grid" | "icon-list";
  /**
   * Layout секции «Что вы освоите». Опционально — если не задан,
   * используется базовый «icon-cards» (двухколоночная сетка карточек с иконками).
   */
  learn_layout?: "icon-cards" | "aurora-numbers" | "beauty-polaroids" | "safety-checklist" | "lab-terminal" | "language-book";
  /**
   * Layout секции «Как проходит обучение». Опционально — если не задан,
   * используется базовый «numbered-list» (нумерованный список 1–N).
   */
  process_layout?: "numbered-list" | "aurora-timeline" | "beauty-steps" | "safety-blueprint" | "lab-ascii" | "language-route";
  /** Цветовая схема секций — светлая (по умолчанию) или тёмная */
  scheme: "light" | "dark";
  /**
   * Тематические фоны секций. Опциональны — если не заданы, секции остаются на
   * сплошном фоне без фоновой иллюстрации (обратная совместимость).
   * Все картинки лежат в `src/assets/landing-templates/decor/` и подключаются через ES6 import.
   */
  section_bg_url?: string;
  pricing_bg_url?: string;
  cta_bg_url?: string;
  /** Прозрачность overlay поверх фона секции (0–1). По умолчанию 0.85 для читаемости. */
  section_bg_overlay?: number;
}

export const defaultLandingTheme: LandingTheme = {
  font_heading: "inter",
  font_body: "inter",
  radius: "soft",
  button_style: "solid",
  card_style: "shadow",
  decor: "none",
  section_spacing: "normal",
  hero_layout: "overlay",
  pricing_layout: "cards",
  audience_layout: "grid",
  reviews_layout: "cards",
  benefits_layout: "grid",
  scheme: "light",
};

/**
 * Как добавить новый шаблон лендинга:
 * 1. Создайте файл `src/lib/landing-templates/<id>.ts` и экспортируйте `LandingTemplate`.
 * 2. Зарегистрируйте его в массиве `LANDING_TEMPLATES` в `src/lib/landing-templates/index.ts`.
 * 3. Сгенерируйте hero-фон 16:10 и сохраните в `src/assets/landing-templates/<id>-hero.jpg`,
 *    подставьте его в `data.hero.background_url` через ES6-импорт.
 * 4. Задайте уникальный `theme: LandingTheme` — комбинацию layout-вариантов и стилей.
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
  /** Глобальная тема оформления шаблона. Если не задана — defaultLandingTheme. */
  theme?: LandingTheme;
  /** Partial data — поля будут смерджены поверх defaultLanding в useLandingEditor */
  data: Partial<LandingData>;
}
