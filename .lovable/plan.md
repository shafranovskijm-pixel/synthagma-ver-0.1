## Задача: убрать «Максимальный» тариф из лендинга, перенести его лимиты в «Профессиональный», добавить блоки «Коробочная версия» и «Разработка сайтов»

### 1. Тариф «Максимальный» → скрыть из лендинга, объединить с «Профессиональным»

**Файл: `src/constants/subscriptionPlans.ts`**

- В `professional.limits`:
  - `maxCourses: -1`, `maxStudents: -1`, `maxTrainedPerMonth: -1`, `storageBytes: -1` (всё безлимит)
  - `trainersEnabled: true` (3D-тренажёры включены, но с пометкой «за доплату» в UI)
  - В `enabledCategories` добавить `'3d_trainers'`
- `maximum` НЕ трогаем — оставляем в типах и объекте, чтобы существующие организации на нём не сломались. Просто скрываем из публичного отображения.

**Файл: `src/components/landing/PricingPlans.tsx`**

- `planOrder` → `['free', 'start', 'standard', 'professional']` (без `maximum`)
- Grid: `lg:grid-cols-4` вместо `lg:grid-cols-5`
- Для строки «3D-тренажёры» в `professional`: рендерим Check + inline-бейдж «за доплату» (маленький pill рядом с текстом, accent-цвет)
- `featureDescriptions["3D-тренажёры"].minPlan` → «Профессиональный»

**Файл: `src/lib/pricingFeatureRows.ts`**

- Обновить логику: `getValue` для «3D-тренажёры» в `professional` возвращает `'за доплату'` (строка) вместо `true`, чтобы отличать от обычного Check.

### 2. Новый блок «Коробочная версия — 540 000 ₽»

**Новый компонент: `src/components/landing/BoxedVersionCard.tsx`**

Стиль Sintagma (teal/cyan, luxury minimal, no gold):
- Центрированная карточка `max-w-xl`, `rounded-2xl`, `bg-card/80`, `backdrop-blur-md`, тонкая рамка `border-border/50`
- Внутри:
  - Бейдж «On-premise» (pill, accent/10)
  - Заголовок «Коробочная версия»
  - Цена `540 000` крупно + `₽` + подпись «единоразово»
  - Подзаголовок «1 неисключительная лицензия»
  - Список (Check, accent):
    - Возможность доработки под ваши требования
    - Установка на ваш сервер
    - Бессрочная лицензия
    - 3 месяца поддержки для интеграции ваших документов
  - CTA-кнопка «Связаться с нами» → `tel:` или модалка обратной связи

### 3. Новый блок «Разработка сайтов для образовательных организаций под ключ — 55 000 ₽»

**Новый компонент: `src/components/landing/WebsiteDevelopmentCard.tsx`**

Стиль Sintagma:
- Карточка во всю ширину контейнера, `rounded-2xl`, `bg-card/80`, `backdrop-blur-md`
- Двухколоночный layout на desktop:
  - **Левая колонка** (flex-1):
    - Бейдж «Новая услуга» (pill, accent)
    - Заголовок «Разработка сайтов для образовательных организаций под ключ»
    - Описание: профессиональные сайты, соответствие требованиям Минобрнауки, адаптивный дизайн, формы заявок, управление контентом
    - Цена `55 000` крупно + `₽` + подпись «фиксированная стоимость»
    - Две кнопки: «Подробнее об услуге» (accent) и «Заказать» (ghost)
  - **Правая колонка** (скрывается на mobile):
    - AI-сгенерированная иллюстрация: isometric/minimal изображение лэндинга образовательного центра в teal/cyan тонах, без текста
    - Генерация через Lovable AI Gateway (`google/gemini-3-pro-image-preview`) → `src/assets/website-dev-illustration.png`

### 4. Расположение секций

**Файл: `src/pages/Index.tsx`**

После `<PricingPlans />` и перед `<Features />` вставляем:
```text
<PricingPlans />
<BoxedVersionCard />
<WebsiteDevelopmentCard />
<Features />
```

### 5. Что НЕ трогаем

- Админка, биллинг, КП, шаблоны договоров, `OrgTariffsPanel` — `maximum` остаётся в enum и базе для обратной совместимости.
- Не делаем миграций БД.

### 6. Техническая деталь: AI-иллюстрация

Один раз через `code--exec` + `lovable_ai.py`:
- Промпт: «Minimal isometric illustration of a modern educational website on a laptop screen, teal and cyan color palette (HSL 174 72% 46%), soft gradients, clean white background, no text, luxury minimalist style, 3D-like but simple»
- Модель: `google/gemini-3-pro-image-preview`
- Output: `src/assets/website-dev-illustration.png`

Подтвердите — приступаю.