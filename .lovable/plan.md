
## Этап 8 — Доводим шаблоны до реально разных лендингов, а не «разный hero + одинаковый низ»

Сейчас проблема подтверждается кодом и вашими скринами: уникальность есть в hero, learn и process, но блоки audience / benefits / reviews / pricing / faq / cta всё ещё рендерятся через слишком похожую геометрию. Плюс в мини-превью часть различий визуально «съедается» из-за масштаба и повторяющихся сеток. Нужно не подкрасить, а физически развести шаблоны по композиции, карточкам, кнопкам, иллюстрациям и motion.

### Что будет сделано

### 1) Превратить шаблоны в пять разных композиций, а не в пять одинаковых секций
Добавлю новые layout-варианты и разведу шаблоны по структуре:

- **Aurora**
  - audience: широкие glass-плашки с иконкой слева и асимметрией
  - benefits: 2x2 premium grid с крупными номерами/подложками
  - reviews: цитаты-стекло с крупной типографикой
  - pricing: hero-tier по центру + две боковые карточки
  - faq: glass accordion с сиянием
  - cta: широкая shimmer-панель

- **Beauty**
  - audience: реальные polaroid / beauty-cards, не стандартные карточки
  - benefits: лепестковая / salon-board композиция
  - reviews: карточки-открытки с фото-рамкой
  - pricing: одна большая VIP-карта + 2 компактные
  - faq: мягкие pill-аккордеоны
  - cta: rounded pink panel с декоративными бьюти-элементами

- **Safety**
  - audience: табличный/регламентный блок, не обычная сетка
  - benefits: blueprint-список с маркировкой пунктов
  - reviews: строгие протоколы/кейсы
  - pricing: сравнение уже есть, но будет усилено под тендерный/корпоративный вид
  - faq: регламентные карточки с кодами пунктов
  - cta: жёсткий корпоративный блок в стиле заявки/сметы

- **Lab**
  - audience: terminal-strip / command cards
  - benefits: code-comment blocks / dark stack
  - reviews: commit-log / issue-card style
  - pricing: package/plan cards как dev dashboard
  - faq: console accordion
  - cta: terminal command panel с кнопкой вида `> start.apply()`

- **Language**
  - audience: карточки-страницы/паспорт/route cards
  - benefits: travel-route / stamp cards
  - reviews: карточки-дневники/письма
  - pricing: уровни A1/A2/B1 как language-path cards
  - faq: бумажные folded cards
  - cta: editorial/paper banner с travel mood

### 2) Добавить недостающие variant-компоненты, а не пытаться выжать всё из старых
Создам новые специализированные варианты секций вместо повторного использования одних и тех же:

Возможные новые компоненты:
- `AudienceWideFeatureRow.tsx`
- `AudienceSafetyTable.tsx`
- `BenefitsPetals.tsx`
- `BenefitsBlueprintList.tsx`
- `BenefitsCodeStack.tsx`
- `ReviewsPostcards.tsx`
- `ReviewsCommitLog.tsx`
- `PricingHeroFocus.tsx`
- `PricingLanguageLevels.tsx`
- `FaqConsole.tsx`
- `FaqPaperCards.tsx`
- `CtaTerminalPanel.tsx`
- `CtaBeautyBanner.tsx`
- `CtaEditorialTravel.tsx`

И подключу их в диспетчеры:
- `LandingAudienceSection.tsx`
- `LandingBenefitsSection.tsx`
- `LandingReviewsSection.tsx`
- `LandingPricingSection.tsx`
- `LandingFaqSection.tsx`
- `LandingCtaSection.tsx`

### 3) Расширить типы темы, чтобы шаблон реально управлял композицией
Сейчас типов layout недостаточно. Расширю `LandingTheme` новыми значениями:
- `audience_layout`
- `benefits_layout`
- `reviews_layout`
- `pricing_layout`
- `faq_layout`
- `cta_layout`

И обновлю:
- `src/lib/landing-templates/types.ts`
- `src/components/course-landing/LandingThemePanel.tsx`

Это позволит шаблонам быть разными не только по стилю, но и по структуре.

### 4) Сгенерировать ИИ-иллюстрации именно для внутренних секций, а не только фон
Использую уже существующую функцию `generate-block-image` для генерации набора перешаблонных декоративных изображений и внедрю их внутрь секций:

- Aurora: luminous gradient object / aurora flare
- Beauty: кисти, флаконы, лепестки, marble accents
- Safety: каска, blueprint fragments, stamps, check forms
- Lab: code snippets, glowing chips, terminal widgets
- Language: карта, штампы, страницы, passport/travel motifs

Изображения будут использоваться не только как background, а как:
- декоративные боковые вставки
- полупрозрачные overlays в CTA/benefits/pricing
- inline-иллюстрации внутри карточек/секций

Файлы:
- `src/assets/landing-templates/decor/*`
- при необходимости новые прозрачные webp/png-ассеты

### 5) Доработать кнопки и motion per-template
Сделаю разные CTA-кнопки не только цветом, а поведением и формой:
- Aurora — shimmer glass CTA
- Beauty — rounded romantic CTA
- Safety — square stamped CTA
- Lab — neon terminal CTA
- Language — editorial outline CTA

Также добавлю различающийся motion:
- разные hover-состояния карточек
- разные reveal-сценарии для новых секций
- отключение лишнего motion в мини-превью, чтобы оно не ломало читаемость

Файл:
- `src/index.css`

### 6) Исправить главное место, где всё должно быть видно: gallery + full preview
Отдельно проверю, что новые различия видны:
- в карточках галереи (`LandingTemplateMiniPreview.tsx`)
- в полноэкранном диалоге (`LandingTemplatePreviewDialog.tsx`)
- на реальном применённом лендинге

Если какая-то разница видна только в полноэкранном режиме, но не видна в галерее, доработаю именно мини-превью: композицию, crop, масштаб, видимую часть секций.

### 7) Переписать данные самих шаблонов под новые layouts
Обновлю:
- `src/lib/landing-templates/aurora.ts`
- `src/lib/landing-templates/beauty.ts`
- `src/lib/landing-templates/safety.ts`
- `src/lib/landing-templates/lab.ts`
- `src/lib/landing-templates/language.ts`

Здесь будет не только другая тема, но и другой набор секционных данных, чтобы шаблоны отличались по ритму, длине карточек, акцентам, подписям, плотности контента.

### 8) Жёсткий QA до объявления “готово”
Перед тем как сказать, что работа завершена, будет обязательная проверка:

1. Сравнение всех 5 карточек в галерее рядом:
   - разные карточки
   - разные кнопки
   - разные секционные силуэты
   - разные внутренние иллюстрации
   - разные ощущения, а не только разный hero

2. Проверка полного preview каждого шаблона:
   - hero
   - audience
   - learn
   - process
   - benefits
   - reviews
   - pricing
   - faq
   - cta

3. Проверка applied-state на реальном лендинге после применения шаблона

4. Финальный проход по вашему критерию:
   - “видно с первого взгляда”
   - “не выглядят однотипно”
   - “непрезентабельные одинаковые карточки исчезли”

Если хотя бы 2 шаблона всё ещё будут ощущаться похожими, работа не будет считаться завершённой.

### Файлы, которые точно затронем
- `src/lib/landing-templates/types.ts`
- `src/lib/landing-templates/aurora.ts`
- `src/lib/landing-templates/beauty.ts`
- `src/lib/landing-templates/safety.ts`
- `src/lib/landing-templates/lab.ts`
- `src/lib/landing-templates/language.ts`
- `src/components/course-editor/LandingTemplateMiniPreview.tsx`
- `src/components/course-editor/LandingTemplatePreviewDialog.tsx`
- `src/components/course-landing/LandingAudienceSection.tsx`
- `src/components/course-landing/LandingBenefitsSection.tsx`
- `src/components/course-landing/LandingReviewsSection.tsx`
- `src/components/course-landing/LandingPricingSection.tsx`
- `src/components/course-landing/LandingFaqSection.tsx`
- `src/components/course-landing/LandingCtaSection.tsx`
- новые файлы в `src/components/course-landing/variants/`
- `src/index.css`
- `src/lib/appVersion.ts`

### Что получится
После этого этапа шаблоны будут отличаться не только hero-блоком, а всем лендингом сверху донизу:
- разной архитектурой секций
- разными типами карточек
- разными CTA-блоками и кнопками
- разными анимациями
- разными ИИ-иллюстрациями внутри секций
- разным визуальным ритмом уже в галерее, без необходимости “вглядываться”
