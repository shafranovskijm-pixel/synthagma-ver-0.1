
## Аврора — один шаблон, но реально доведённый до «вау»

Цель: перестать пытаться развести сразу все 5 шаблонов и сделать **одну Аврору** заметно другой и презентабельной уже в карточке, в full preview и после применения к курсу.

### Что будет изменено

#### 1. Сделать Аврору визуально другой по всей странице, а не только в hero
Пересоберу сам шаблон `aurora.ts` так, чтобы у него были не базовые секции, а собственный ритм:

- `audience` оставить как `wide-feature-row`, но усилить:
  - большие glow-иконки
  - асимметричные ряды
  - разная ширина карточек
- `benefits` перевести с `grid` на новый **aurora-only** layout:
  - 2x2 premium cards с большими цифрами `01–04`
  - стеклянные панели
  - светящиеся подложки
  - встроенная ИИ-иллюстрация
- `reviews` вместо обычной кладки сделать более «премиальными»:
  - цитаты с крупной типографикой
  - glow/blur подложки
  - один акцентный главный отзыв
- `pricing` заменить текущий `hero-focus` на **aurora-specific** composition:
  - центр — увеличенный premium tier
  - боковые тарифы смещены ниже
  - сияющая рамка и свечение только у центрального тарифа
- `faq` убрать с `default` на **новый aurora FAQ**:
  - glass accordion
  - светящаяся активная строка
  - мягкая анимация раскрытия
- `cta` усилить существующий shimmer-panel:
  - отдельная aurora-подложка
  - ИИ-объект/свечение внутри секции
  - более дорогая типографика и более заметная кнопка

#### 2. Добавить недостающие aurora-only компоненты
Создам отдельные компоненты именно под Аврору, а не буду вытягивать её из общих grid-вариантов:

- `BenefitsAuroraShowcase.tsx`
- `PricingAuroraSpotlight.tsx`
- `FaqAuroraGlass.tsx`
- при необходимости `ReviewsAuroraQuotes.tsx`

И подключу их в диспетчеры:
- `LandingBenefitsSection.tsx`
- `LandingPricingSection.tsx`
- `LandingFaqSection.tsx`
- `LandingReviewsSection.tsx`

### 3. Дорисовать Аврору ИИ-ассетами внутри секций
Сейчас у Авроры есть фоновые изображения, но не хватает **внутренних** декоративных объектов. Добавлю aurora-specific изображения, сгенерированные ИИ:

- `aurora-inline.webp` — светящийся абстрактный crystal/blob
- `aurora-pricing-inline.webp` — сияющий объект/орб для pricing
- `aurora-cta-inline.webp` — premium glow accent для CTA

Использование:
- как боковые decorative inserts
- как полупрозрачные overlays
- как якорные акценты внутри cards/CTA/pricing

Файлы:
- `src/assets/landing-templates/decor/*`

### 4. Дать Авроре свои анимации, а не общие hover-эффекты
В `src/index.css` добавлю aurora-only motion:

- мягкий shimmer sweep
- glow pulse для акцентных карточек
- slow float для декоративных объектов
- reveal-анимацию секций в одной эстетике
- отдельные hover-состояния для карточек и CTA-кнопки

Важно: в мини-превью анимации будут облегчёнными, чтобы карточка не превращалась в кашу.

### 5. Починить места, где изменения должны быть видны сразу
Чтобы Аврора реально отличалась везде, отдельно проверю и при необходимости поправлю:

- `LandingTemplateMiniPreview.tsx`
  - чтобы в карточке были видны именно новые aurora-секции, а не только hero
  - при необходимости скорректирую скролл/видимую композицию
- `LandingTemplatePreviewDialog.tsx`
  - убрать платформенное выравнивание, которое может гасить тему
  - дать теме Авроры рендериться честно
- applied-state после применения шаблона к курсу

### 6. Обновить тему Авроры
В `src/lib/landing-templates/aurora.ts` зафиксирую Aurora как отдельную сильную композицию:

- `benefits_layout` → aurora-specific
- `pricing_layout` → aurora-specific
- `faq_layout` → aurora-specific
- `reviews_layout` → aurora-specific или усиленный текущий
- обновлю данные секций:
  - короче, дороже, увереннее
  - больше акцентных коротких формулировок
  - меньше типового текста «как у всех»

### Файлы, которые затрону
- `src/lib/landing-templates/aurora.ts`
- `src/lib/landing-templates/types.ts`
- `src/components/course-landing/LandingBenefitsSection.tsx`
- `src/components/course-landing/LandingPricingSection.tsx`
- `src/components/course-landing/LandingFaqSection.tsx`
- `src/components/course-landing/LandingReviewsSection.tsx`
- новые файлы в `src/components/course-landing/variants/`
- `src/components/course-editor/LandingTemplateMiniPreview.tsx`
- `src/components/course-editor/LandingTemplatePreviewDialog.tsx`
- `src/index.css`
- `src/lib/appVersion.ts`
- `src/assets/landing-templates/decor/aurora-*.webp`

### Критерий готовности
Работа считается завершённой только если **одна Аврора**:

1. выглядит дорого и заметно отличается уже в карточке галереи;
2. в full preview отличается не только hero, а и `audience / benefits / reviews / pricing / faq / cta`;
3. после применения к курсу сохраняет тот же сильный вид;
4. имеет:
   - свои карточки,
   - свой фон,
   - свои ИИ-иллюстрации,
   - свои анимации,
   - свою CTA-зону.

### QA перед сдачей
Перед тем как сказать «готово», будет обязательная проверка именно по Авроре:

- карточка галереи
- full preview
- реальный применённый лендинг
- проверка, что:
  - benefits больше не обычный grid
  - faq больше не дефолтный аккордеон
  - pricing не выглядит как стандартные 3 карточки
  - внутри секций есть ИИ-декор
  - motion виден, но не мешает чтению

Результат этого этапа: **одна Аврора станет полноценным премиальным лендингом**, а не «тот же шаблон с другим hero».
