/**
 * Per-template визуальные «личности» — карточки, кнопки, заголовки секций.
 *
 * Цель: каждый шаблон лендинга имеет узнаваемый характер, отличающий его
 * от других — даже если базовые токены темы (`card_style`, `radius`) совпадают.
 *
 * Архитектура:
 *  - Этот реестр читается через хук `useTemplateStyle(templateId)` на стороне
 *    варианта секции (PricingCards, AudienceGrid, BenefitsGrid, ...).
 *  - Если templateId не найден — возвращается `defaultTemplateStyle` и поведение
 *    остаётся прежним (обратная совместимость).
 *  - Никаких динамических Tailwind-классов — только статичные строки и data-атрибуты,
 *    которые матчатся через `index.css` (см. блок «Per-template skins»).
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
  /** data-атрибут для матча CSS-скинов из index.css */
  dataSkin: string;
}

export const defaultTemplateStyle: TemplateStyle = {
  card: "",
  cardHighlight: "",
  button: "",
  sectionTitle: "",
  dataSkin: "",
};

/**
 * AURORA — премиальный glass с градиентной рамкой и shimmer-кнопкой.
 * Beauty — мягкая розовая тень, волнистый низ, pill-кнопка с эмодзи hover.
 * Safety — жёсткие прямоугольники, угловой бейдж «п.X.X», диагональная штриховка hover.
 * Lab — тёмные карточки с неоновым свечением, моноширинный prefix, кнопка-терминал.
 * Language — карточка с «закладкой» (уголок-загиб), подпись курсивом.
 */
const TEMPLATE_STYLES: Record<string, TemplateStyle> = {
  aurora: {
    card: "tpl-aurora-card",
    cardHighlight: "tpl-aurora-card-highlight",
    button: "tpl-aurora-button",
    sectionTitle: "tpl-aurora-section-title",
    dataSkin: "aurora",
  },
  beauty: {
    card: "tpl-beauty-card",
    cardHighlight: "tpl-beauty-card-highlight",
    button: "tpl-beauty-button",
    sectionTitle: "tpl-beauty-section-title",
    dataSkin: "beauty",
  },
  safety: {
    card: "tpl-safety-card",
    cardHighlight: "tpl-safety-card-highlight",
    button: "tpl-safety-button",
    sectionTitle: "tpl-safety-section-title",
    dataSkin: "safety",
  },
  lab: {
    card: "tpl-lab-card",
    cardHighlight: "tpl-lab-card-highlight",
    button: "tpl-lab-button",
    cardTitlePrefix: "> ",
    sectionTitle: "tpl-lab-section-title",
    dataSkin: "lab",
  },
  language: {
    card: "tpl-language-card",
    cardHighlight: "tpl-language-card-highlight",
    button: "tpl-language-button",
    sectionTitle: "tpl-language-section-title",
    dataSkin: "language",
  },
};

export function getTemplateStyle(templateId?: string | null): TemplateStyle {
  if (!templateId) return defaultTemplateStyle;
  return TEMPLATE_STYLES[templateId] ?? defaultTemplateStyle;
}
