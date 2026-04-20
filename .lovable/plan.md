

## Этап 6 — Реальная визуальная разница (фикс): шрифты, скины везде, тёмный Lab

После Этапов 1–5 каждый шаблон имеет уникальный hero, но вся «средняя» часть (audience, benefits, reviews, pricing, faq, cta) всё ещё выглядит одинаково. Причина — три недоделки. Этот этап их закрывает.

### Корневые причины проблемы

1. **Шрифты Unbounded / Playfair / JetBrains / Manrope / PT Serif НЕ загружаются в проект.** В `index.html` нет `<link>` на Google Fonts, а `font-family: 'Unbounded'` без подключённого файла молча падает на системный sans-serif. Поэтому у всех 5 шаблонов заголовки выглядят одним шрифтом.
2. **Половина вариантов секций не использует `useTemplateStyle()`.** `AudienceIconsRow` (Lab, Language), `AudienceStackedCards` (Beauty), `BenefitsIconList` (Safety, Lab), `ReviewsCards/Carousel/Masonry`, `LandingFaqSection`, `LandingCtaSection` — все рендерят базовые `cardStyleClass` без `tpl-*-card`. Поэтому даже там, где layout разный, **сами карточки выглядят одинаково**.
3. **Hero у Lab светлый, хотя `scheme: "dark"`.** На скрине у «Лаборатория» виден светлый блок «Кому подойдёт курс» поверх тёмного фона — это значит, классы `bg-zinc-950 text-zinc-100` из провайдера применяются только к корневому `<div>`, а секции внутри не наследуют тёмную палитру (у них собственный `bg-card/background`).

### Что делаем

**1. Подключаем шрифты (index.html)**
Добавляем один `<link>` Google Fonts c подмножеством кириллицы:
```html
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=JetBrains+Mono:wght@400;600&family=Manrope:wght@500;700&family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" crossorigin>
```
Сразу заголовки получают узнаваемый характер: Aurora — геометричный Unbounded, Beauty — каллиграфический Playfair Italic, Lab — моноширинный JetBrains, Language — мягкий PT Serif с курсивом, Safety — строгий Inter Bold.

**2. Применяем `useTemplateStyle()` ко всем оставшимся вариантам**
Добавляем `skin.card`, `skin.button`, `skin.sectionTitle`, `skin.cardTitlePrefix` в:
- `AudienceIconsRow.tsx` — обёртка иконки + подпись получают `skin.card` (для Lab — тёмный квадрат с неоновым свечением; для Language — карточка-страница с закладкой).
- `AudienceStackedCards.tsx` — заменяем общий `cardStyleClass` на `skin.card` (Beauty получает свой волнистый низ + розовую тень).
- `BenefitsGrid.tsx` — заменяем заголовок «Преимущества» на `skin.sectionTitle` и `skin.cardTitlePrefix`.
- `BenefitsIconList.tsx` — иконка + строка получают тематический фон/border (Safety — синий border, Lab — неоновое свечение).
- `PricingComparison.tsx` — таблица получает `skin.card` для шапки.
- `ReviewsCards / ReviewsCarouselMini / ReviewsMasonry` — отзывы рендерятся на `skin.card` (для Beauty — наклонённые «фотокарточки», для Lab — тёмные с моноширинным никнеймом, для Language — на бумажной текстуре).
- `LandingFaqSection.tsx` — каждый вопрос-аккордеон получает `skin.card` + `skin.cardTitlePrefix` (для Lab — `> question_01`).
- `LandingCtaSection.tsx` — CTA-кнопка получает `skin.button` (Aurora shimmer, Beauty pill+heart, Safety sharp, Lab terminal, Language outline italic).

**3. Lab — настоящая тёмная схема**
В `LandingThemeProvider.tsx` при `scheme === "dark"` дополнительно выставляем CSS-переменные:
```css
--background: 222 47% 7%;    /* zinc-950 */
--foreground: 210 20% 96%;
--card: 222 40% 11%;
--muted-foreground: 215 16% 65%;
--border: 215 20% 22%;
```
Тогда **все** дочерние секции (audience, benefits, reviews, faq, pricing) автоматически становятся тёмными, без правок отдельных компонентов. Шаблон Lab получает целиком тёмный лендинг — как в референсах IT-курсов.

**4. Дополнительные шаблон-специфичные акценты в `templateStyles.ts`**
- Добавляем поле `iconWrap` (классы для обёртки иконки): Aurora — gradient pill, Beauty — soft circle с тенью, Safety — sharp square с border, Lab — неоновый dot, Language — оттиск кисти.
- Добавляем поле `accentBg` (фон активной/highlight-секции).
- Применяем эти классы во всех вариантах через тот же хук.

### Файлы

- `index.html` — добавление `<link>` Google Fonts.
- `src/lib/landing-templates/templateStyles.ts` — расширение `TemplateStyle` (`iconWrap`, `accentBg`).
- `src/index.css` — `tpl-*-icon-wrap`, `tpl-*-accent-bg` классы; для `[data-template-skin="lab"]` — переопределение CSS-переменных темы.
- `src/components/course-landing/LandingThemeProvider.tsx` — инжекция тёмных CSS-переменных при `scheme === "dark"`.
- `src/components/course-landing/variants/AudienceIconsRow.tsx`, `AudienceStackedCards.tsx`, `BenefitsGrid.tsx`, `BenefitsIconList.tsx`, `PricingComparison.tsx`, `ReviewsCards.tsx`, `ReviewsCarouselMini.tsx`, `ReviewsMasonry.tsx` — подключение `useTemplateStyle()`.
- `src/components/course-landing/LandingFaqSection.tsx`, `LandingCtaSection.tsx` — то же самое.
- `src/lib/appVersion.ts` → `1.0.26`.

### Что получится (визуально)

В галерее карточек:
- **Aurora** — заголовки геометричным Unbounded, glass-карточки с shimmer-кнопкой, мягкое тиал-свечение.
- **Beauty** — каллиграфический Playfair Italic в заголовках, наклонённые карточки-фотокарточки, розовый pill-CTA с сердечком.
- **Safety** — строгий Inter Bold, прямоугольные карточки с угловым бейджем «п.X.X» и синим border, sharp-кнопка УТВЕРДИТЬ.
- **Lab** — **полностью чёрный лендинг**, моноширинный JetBrains во всех заголовках, неоновые тёмные карточки, кнопка `> ./apply.sh`, заголовки с префиксом `> `.
- **Language** — мягкий PT Serif Italic, карточки на бежевой бумаге с уголком-загибом, outline-кнопки с подчёркиванием курсивом.

После этого этапа разница между шаблонами — не только в hero, а во **всём контенте сверху донизу**.

