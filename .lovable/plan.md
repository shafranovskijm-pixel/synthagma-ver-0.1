

## Делаем шаблоны действительно разными — на уровне layout, типографики и декора

### Корневая проблема

Все 5 шаблонов сейчас используют **один и тот же набор React-компонентов** (`LandingHeroSection`, `LandingPricingSection`, `LandingAudienceSection` и т.д.) с фиксированной вёрсткой. Меняются только:
- тексты
- обложка/фон
- акцентный цвет

Из-за этого визуально шаблоны почти одинаковые: один hero с заголовком слева внизу, тот же грид аудитории 3 в ряд, те же одинаковые карточки тарифов. На скриншотах конкурентов (Profit Course / The Manner) каждый лендинг выглядит как **отдельная дизайн-работа**: разные hero (split-layout с фото справа, тёмный с таймером, светлый с пастельными карточками), разные кнопки, разные формы карточек, разные шрифтовые ритмы.

### Решение: система «вариантов» секций (skin-система)

Вводим понятие **`layout_variant`** — каждая секция получает 2–3 визуальных варианта рендера. Шаблон выбирает свой набор вариантов + свою глобальную «тему оформления» (`theme`).

#### 1. Глобальная тема шаблона (`LandingTheme`)

В `src/lib/landing-templates/types.ts` добавляем:

```ts
export interface LandingTheme {
  font_heading: 'inter' | 'manrope' | 'playfair' | 'unbounded' | 'jetbrains';
  font_body: 'inter' | 'manrope' | 'pt-serif';
  radius: 'sharp' | 'soft' | 'pill';        // border-radius системы — 0 / 16px / 9999
  button_style: 'solid' | 'outline' | 'gradient' | 'neon'; // CTA-кнопки
  card_style: 'flat' | 'shadow' | 'glass' | 'bordered'; // карточки тарифов/аудитории
  decor: 'none' | 'dots' | 'grid' | 'noise' | 'aurora' | 'sparkles'; // фоновый декор страницы
  section_spacing: 'compact' | 'normal' | 'roomy'; // py-12 / py-20 / py-32
  hero_layout: 'overlay' | 'split-right' | 'split-left' | 'centered-photo';
  pricing_layout: 'cards' | 'comparison' | 'highlight-middle';
  audience_layout: 'grid' | 'icons-row' | 'stacked-cards';
  reviews_layout: 'cards' | 'masonry' | 'carousel-mini';
}

interface LandingTemplate {
  // ... существующие поля
  theme: LandingTheme;
}
```

#### 2. Варианты рендера секций (skins)

Для ключевых секций пишем по **2–3 варианта компонентов**. Базовый компонент — диспетчер.

**Hero — 4 варианта:**
- `overlay` (текущий) — изображение на весь экран, текст слева внизу.
- `split-right` — слева текст + кнопка + бейджи, справа большой круглый/прямоугольный портрет (как The Manner).
- `centered-photo` — крупный заголовок по центру сверху, фото-«полароид» под ним.
- `dark-promo` — чёрный фон с большим жёлтым/неоновым акцентным заголовком и таймером (как Чёрная Пятница).

**Pricing — 3 варианта:**
- `cards` (текущий) — 3 одинаковых карточки в ряд.
- `highlight-middle` — средний тариф крупнее, с приподнятой высотой и градиентной рамкой.
- `comparison` — таблица сравнения с галочками по строкам.

**Audience — 3 варианта:**
- `grid` (текущий) — 3 карточки в ряд.
- `icons-row` — иконки в горизонтальной ленте без рамок, минималистично.
- `stacked-cards` — наложенные карточки с лёгким поворотом (decor для бьюти).

**Reviews — 3 варианта:**
- `cards` (текущий)
- `masonry` — разная высота карточек, с фото
- `carousel-mini` — горизонтальная карусель полосой

**Benefits — 2 варианта:** `grid` / `icon-list`.

Файлы (в `src/components/course-landing/variants/`):
- `HeroOverlay.tsx`, `HeroSplitRight.tsx`, `HeroCenteredPhoto.tsx`, `HeroDarkPromo.tsx`
- `PricingCards.tsx`, `PricingHighlightMiddle.tsx`, `PricingComparison.tsx`
- `AudienceGrid.tsx`, `AudienceIconsRow.tsx`, `AudienceStackedCards.tsx`
- `ReviewsCards.tsx`, `ReviewsMasonry.tsx`, `ReviewsCarouselMini.tsx`
- `BenefitsGrid.tsx`, `BenefitsIconList.tsx`

Существующие `LandingHeroSection.tsx` и т.д. становятся **диспетчерами**: читают `theme.hero_layout` из контекста (или пропа) и рендерят нужный variant. Если variant не задан — fallback на текущую вёрстку (обратная совместимость для уже сохранённых лендингов).

#### 3. Глобальный декор и типографика

Создаём `LandingThemeProvider` — обёртка для всего публичного лендинга и предпросмотра, которая:
- Подгружает шрифты темы через CSS-классы (`font-playfair`, `font-unbounded` уже доступны через Tailwind / @fontsource).
- Применяет CSS-переменные на корне: `--landing-radius`, `--landing-spacing-section`, `--landing-decor-bg` (SVG-pattern data URL).
- Применяет паттерн фона страницы (dots/grid/noise/aurora) через absolute-overlay внутри провайдера.
- Прокидывает `theme` через React Context, чтобы варианты секций читали `useLandingTheme()`.

Файл: `src/components/course-landing/LandingThemeProvider.tsx` + `src/lib/landing-templates/themeTokens.ts` (карта radius/spacing/decor → CSS-значения).

#### 4. Уникальная тема для каждого шаблона

| Шаблон | Hero | Pricing | Кнопки | Карточки | Шрифт | Декор |
|---|---|---|---|---|---|---|
| **Aurora** (премиум-бизнес) | overlay | highlight-middle | gradient | glass | unbounded + inter | aurora |
| **Beauty** (бьюти) | centered-photo | cards | pill (розовая) | shadow | playfair + inter | sparkles + пастельный градиент |
| **Safety** (охрана труда) | split-right (каска) | comparison (таблица) | solid (синяя) | bordered | inter + inter | grid (чертёжная сетка) |
| **Lab** (IT) | dark-promo | cards (тёмные) | neon (фиолетово-голубое свечение) | flat (тёмная карточка с border) | jetbrains + inter | dots + код-штрихи |
| **Language** (языки) | split-left + книги | highlight-middle | outline (янтарь) | shadow | manrope + pt-serif | noise (бумажная текстура) |

Это — **глобальные** настройки на каждый шаблон, не только цвет/обложка.

#### 5. Применение шаблона сохраняет theme

В `LandingTemplatesGallery.handleApply` `theme` шаблона записывается в `landing_content.theme`. Публичная страница `CourseLanding.tsx` и предпросмотр читают этот `theme` через `LandingThemeProvider`. Если `theme` отсутствует (старые курсы) — используется `defaultTheme` с текущим визуалом (обратная совместимость).

#### 6. Редактируемость

Глобальные настройки темы (шрифт/радиус/декор/layout) пользователь может менять — добавляем в редактор страницы новую вкладку **«Оформление»** с переключателями `hero_layout`, `pricing_layout`, `card_style`, `decor`, `font_heading`. Это уже после первой итерации шаблонов — структурно поддерживается, но в этой задаче UI-вкладку не делаем (только применение из шаблонов работает).

---

### Какие файлы создаём / меняем

**Новые:**
- `src/lib/landing-templates/themeTokens.ts` — карта токенов темы → CSS/классы.
- `src/components/course-landing/LandingThemeProvider.tsx` — Context + декор-overlay + загрузка шрифтов.
- `src/components/course-landing/variants/HeroOverlay.tsx`
- `src/components/course-landing/variants/HeroSplitRight.tsx`
- `src/components/course-landing/variants/HeroCenteredPhoto.tsx`
- `src/components/course-landing/variants/HeroDarkPromo.tsx`
- `src/components/course-landing/variants/PricingCards.tsx`
- `src/components/course-landing/variants/PricingHighlightMiddle.tsx`
- `src/components/course-landing/variants/PricingComparison.tsx`
- `src/components/course-landing/variants/AudienceGrid.tsx`
- `src/components/course-landing/variants/AudienceIconsRow.tsx`
- `src/components/course-landing/variants/AudienceStackedCards.tsx`
- `src/components/course-landing/variants/ReviewsMasonry.tsx`
- `src/components/course-landing/variants/ReviewsCarouselMini.tsx`
- `src/components/course-landing/variants/BenefitsIconList.tsx`

**Изменения:**
- `src/lib/landing-templates/types.ts` — добавляем `LandingTheme` и `theme: LandingTheme` в `LandingTemplate`.
- `src/lib/landing-templates/{aurora,beauty,safety,lab,language}.ts` — у каждого свой уникальный `theme` (см. таблицу выше).
- `src/components/course-landing/LandingHeroSection.tsx` → диспетчер вариантов по `theme.hero_layout`.
- `src/components/course-landing/LandingPricingSection.tsx` → диспетчер.
- `src/components/course-landing/LandingAudienceSection.tsx` → диспетчер.
- `src/components/course-landing/LandingReviewsSection.tsx` → диспетчер.
- `src/components/course-landing/LandingBenefitsSection.tsx` → диспетчер.
- `src/hooks/useLandingEditor.ts` — добавляем `theme?: LandingTheme` в `LandingData`, мерджим из `existing` и сохраняем.
- `src/pages/CourseLanding.tsx` — оборачиваем секции в `<LandingThemeProvider theme={landing.theme}>`.
- `src/components/course-editor/LandingTemplatePreviewDialog.tsx` — то же оборачивание.
- `src/components/course-editor/LandingTemplateMiniPreview.tsx` — то же оборачивание (чтобы превью карточки тоже отличалось layout-ом).
- `src/components/course-editor/LandingTemplatesGallery.tsx` — `handleApply` сохраняет `theme` в `landing_content`.
- `src/lib/appVersion.ts` → `1.0.19`.

Шрифты (Unbounded, Playfair Display, JetBrains Mono, Manrope, PT Serif) подключаем через `@fontsource/*` (npm-пакеты уже идиоматичны для Vite — если ещё не стоят, ставятся одной командой) либо через `<link>` в `index.html` от Google Fonts.

---

### Edge-кейсы и обратная совместимость

- Старые курсы без `landing_content.theme` рендерятся с `defaultTheme` (точный текущий вид) — ничего не ломается.
- При применении шаблона `theme` перезаписывается полностью (это и есть смысл шаблона).
- Каждый variant принимает один и тот же набор пропов (`title`, `items`, `isEditing`, …) — редактор продолжает работать без изменений в логике inline-редактирования.
- Превью (mini + dialog) использует тот же `LandingThemeProvider` → пользователь сразу видит реальные различия в галерее.
- Если `theme.hero_layout = 'split-right'`, но у курса нет фото — fallback на круглый плейсхолдер с инициалами.
- Производительность: шрифты грузятся `font-display: swap`; декор-паттерны — inline SVG ≤ 2 КБ.

### Что получится

После реализации в галерее карточек будут видны **реально разные лендинги**: разная композиция hero, разные шрифты, разные формы кнопок и карточек, разные паттерны фона — как на референсах конкурентов. Каждый шаблон — отдельная дизайн-работа, а не покраска одного и того же скелета.

