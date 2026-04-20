/**
 * Per-template визуальные «личности» — карточки, кнопки, заголовки, иконки, акцентный фон.
 *
 * Этап 6: расширили реестр полями `iconWrap` и `accentBg`, чтобы и обёртки иконок,
 * и highlight-фоны секций отличались между шаблонами. Применяется во ВСЕХ
 * вариантах секций (audience/benefits/reviews/faq/cta/pricing) через хук
 * `useTemplateStyle()` из `LandingThemeProvider`.
 */

export interface TemplateStyle {
  /** Базовый класс карточки (audience, benefits, pricing) */
  card: string;
  /** Класс популярного тарифа в pricing (поверх card) */
  cardHighlight: string;
  /** CTA-кнопка (apply/buy) */
  button: string;
  /** Inline-prefix перед заголовком карточки (пример: «> ») */
  cardTitlePrefix?: string;
  /** Дополнительный класс заголовка секции для подчёркивания/штриха */
  sectionTitle: string;
  /** Класс обёртки иконки (audience-row, benefits-list) */
  iconWrap: string;
  /** Фон секции с акцентом (например, hero-mini в audience) */
  accentBg: string;
  /** data-атрибут для матча CSS-скинов из index.css */
  dataSkin: string;
}

export const defaultTemplateStyle: TemplateStyle = {
  card: "",
  cardHighlight: "",
  button: "",
  sectionTitle: "",
  iconWrap: "",
  accentBg: "",
  dataSkin: "",
};

const TEMPLATE_STYLES: Record<string, TemplateStyle> = {
  aurora: {
    card: "tpl-aurora-card",
    cardHighlight: "tpl-aurora-card-highlight",
    button: "tpl-aurora-button",
    sectionTitle: "tpl-aurora-section-title",
    iconWrap: "tpl-aurora-icon-wrap",
    accentBg: "tpl-aurora-accent-bg",
    dataSkin: "aurora",
  },
  beauty: {
    card: "tpl-beauty-card",
    cardHighlight: "tpl-beauty-card-highlight",
    button: "tpl-beauty-button",
    sectionTitle: "tpl-beauty-section-title",
    iconWrap: "tpl-beauty-icon-wrap",
    accentBg: "tpl-beauty-accent-bg",
    dataSkin: "beauty",
  },
  safety: {
    card: "tpl-safety-card",
    cardHighlight: "tpl-safety-card-highlight",
    button: "tpl-safety-button",
    sectionTitle: "tpl-safety-section-title",
    iconWrap: "tpl-safety-icon-wrap",
    accentBg: "tpl-safety-accent-bg",
    dataSkin: "safety",
  },
  lab: {
    card: "tpl-lab-card",
    cardHighlight: "tpl-lab-card-highlight",
    button: "tpl-lab-button",
    cardTitlePrefix: "> ",
    sectionTitle: "tpl-lab-section-title",
    iconWrap: "tpl-lab-icon-wrap",
    accentBg: "tpl-lab-accent-bg",
    dataSkin: "lab",
  },
  language: {
    card: "tpl-language-card",
    cardHighlight: "tpl-language-card-highlight",
    button: "tpl-language-button",
    sectionTitle: "tpl-language-section-title",
    iconWrap: "tpl-language-icon-wrap",
    accentBg: "tpl-language-accent-bg",
    dataSkin: "language",
  },
};

export function getTemplateStyle(templateId?: string | null): TemplateStyle {
  if (!templateId) return defaultTemplateStyle;
  return TEMPLATE_STYLES[templateId] ?? defaultTemplateStyle;
}
