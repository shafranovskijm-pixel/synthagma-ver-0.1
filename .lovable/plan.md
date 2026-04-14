

# Следующая волна оптимизаций

## Обнаруженные проблемы

### 1. Неиспользуемые UI-компоненты и зависимости — мёртвый вес в бандле

6 UI-компонентов из `src/components/ui/` **нигде не импортируются** в проекте:

| Компонент | npm-зависимость | ~KB в бандле |
|---|---|---|
| `toast.tsx` | `@radix-ui/react-toast` | ~15 |
| `resizable.tsx` | `react-resizable-panels` | ~25 |
| `carousel.tsx` | `embla-carousel-react` | ~20 |
| `hover-card.tsx` | `@radix-ui/react-hover-card` | ~8 |
| `menubar.tsx` | `@radix-ui/react-menubar` | ~12 |
| `navigation-menu.tsx` | `@radix-ui/react-navigation-menu` | ~10 |
| `aspect-ratio.tsx` | `@radix-ui/react-aspect-ratio` | ~3 |
| `input-otp.tsx` | `input-otp` | ~5 |

Также **3 npm-пакета Capacitor** (`@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/cli`) используются только в 2 строках проверки `window.Capacitor` — сами пакеты не нужны в web-бандле.

**Действие**: удалить файлы и зависимости (~100 KB экономии бандла).

### 2. `useCourseLearning.ts` — монолитный хук (834 строки, 35 useState, 13 useEffect)

Самый тяжёлый хук проекта. Возвращает **50+ значений**. Содержит логику:
- Навигации по урокам
- Тестирования
- TTS (синтез речи)
- AI-чат
- Видео-прогресс
- Офлайн-кеш
- Обратная связь

**Действие**: разбить на 5 хуков: `useLessonNavigation`, `useTestLogic`, `useLessonTTS`, `useLessonChat`, `useLessonVideo`.

### 3. Оставшиеся `: any` — 236 штук

Топ-5 файлов:
- `useMarketplaceValidation.ts` — 17
- `BulkContentGenerator.tsx` — 13
- `ProfileTab.tsx` — 12
- `courseCache.ts` — 11
- `AdminMarketplaceManager.tsx` — 10

### 4. Дублированная загрузка данных организации

`ActGenerator`, `InvoiceGenerator`, `ConsentGenerator` — каждый имеет свою функцию `loadOrganization()` с одинаковым запросом к таблице `organizations`. Можно вынести в общий хук.

---

## План работ

### Этап 1. Удаление неиспользуемых UI-компонентов и зависимостей

Удалить 8 файлов из `components/ui/` и соответствующие npm-зависимости из `package.json`. Это уменьшит бандл на ~100 KB.

### Этап 2. Декомпозиция useCourseLearning (834 строки → 5 хуков)

- `useLessonNavigation.ts` — навигация, прогресс, sidebar
- `useLessonTest.ts` — тестирование, ответы, пересдача
- `useLessonTTS.ts` — синтез речи
- `useLessonChat.ts` — AI-чат
- `useLessonVideo.ts` — видео-прогресс, позиция

`useCourseLearning` остаётся как фасад, вызывающий 5 подхуков.

### Этап 3. Общий хук useOrganizationDetails для генераторов документов

Вынести `loadOrganization()` из Act/Invoice/ConsentGenerator в `useOrganizationDetails.ts`. Уберёт ~150 строк дублированного кода.

### Этап 4. Типизация топ-5 файлов (63 any → 0)

Заменить `: any` на конкретные типы из `Database` или создать локальные интерфейсы.

---

## Ожидаемый эффект

| Метрика | До | После |
|---|---|---|
| Неиспользуемые UI-компоненты | 8 | 0 |
| Лишние npm-зависимости | ~8 пакетов | 0 |
| useCourseLearning строк | 834 | ~100 (фасад) |
| Дубликаты loadOrganization | 3 копии | 1 хук |
| `: any` в топ-файлах | 63 | 0 |
| Размер бандла | −~100 KB |

