

## Реструктуризация попапа «Выберите тип блока» по образцу SkillSpace

### 1. Что убираем из попапа выбора блока
- Группа **«Выделения»** целиком (Информация, Предупреждение, Совет, Выполнено, Ошибка, Выделение, Цитата) — они доступны только из меню «Доп. оформление» при выделении текста.
- Дубликаты **заголовков** (Заголовок 1/2) и **списков** (Маркир./Нумер.) — они уже доступны через popover «Стиль текста» (T) и «Список» в флоатинг-тулбаре над выделенным текстом.
- **Параграф** — создаётся автоматически.
- **Разделитель** оставляем (есть в SkillSpace неявно — но удобный).

### 2. Финальный набор блоков (по SkillSpace + наши плюсы)
**Базовые (SkillSpace):**
- Текст (paragraph) — единая точка входа для всего текста
- Видео
- Картинка
- Файл (= наш `document`, переименуем подпись)
- Презентация (= наш `slider`)
- Аудио
- **Таблица** ← новый
- Callout (откроет под-выбор: 5 типов callout + highlight + quote)
- **Кнопка** ← новый
- **Embed** ← новый (iframe для YouTube/codepen/figma и т.п.)
- **Код** ← новый (моноширинный блок с подсветкой)
- **Формула** ← новый (KaTeX/MathJax)

**Наши доп. блоки (оставляем):**
- Мини-квиз
- Сворачиваемая секция (аккордеон)
- Разделитель

**AI-блоки (новая группа «ИИ»):**
- AI-картинка — генерация через Lovable AI (`google/gemini-2.5-flash-image`)
- AI-аудио (озвучка) — через существующую SaluteSpeech edge-функцию
- AI-тест — через существующий генератор тестов

### 3. Новые типы блоков — реализация
Добавляем в `BlockType`:
- `table` — простая таблица (rows × cols, редактирование ячеек, добавление/удаление строк/колонок)
- `button` — кнопка с текстом, ссылкой, стилем (primary/outline) и выравниванием
- `embed` — поле URL → отрендерит `<iframe>` с белым списком доменов (youtube, vimeo, codepen, figma, miro, kinescope, google docs)
- `code` — `<pre><code>` с выбором языка и моноширинным шрифтом
- `formula` — KaTeX-рендер (поставим `katex` пакет, inline и block режимы)

Файлы:
- `src/components/course-builder/block-editor/types.ts` — добавить типы, конфиг, описания, иконки, `createBlock` для новых
- `src/components/course-builder/block-editor/blocks/BlockContent.tsx` — `case` для новых типов с редакторами
- `src/components/course-builder/block-editor/BlockRenderer.tsx` — рендер для предпросмотра/публикации
- Новые файлы: `blocks/TableBlock.tsx`, `blocks/ButtonBlock.tsx`, `blocks/EmbedBlock.tsx`, `blocks/CodeBlock.tsx`, `blocks/FormulaBlock.tsx`

### 4. AI-блоки — поведение
При выборе AI-карточки в попапе → закрытие → открытие существующих диалогов:
- AI-картинка → создаёт `image` блок, открывает диалог промпта → заполняет `imageSrc` (новая edge-функция `generate-block-image` через Lovable AI Gateway)
- AI-аудио → создаёт `audio` блок, использует уже существующий поток TTS из `BlockContent.tsx`
- AI-тест → создаёт `quiz` блок, использует существующую функцию автогенерации вопросов

Это **не новые типы блоков**, а ярлыки в попапе, которые после выбора создают обычный блок и сразу открывают AI-диалог.

### 5. Перестройка `blockCategories` в `types.ts`
```ts
{
  basic: { label: "Основные", items: [paragraph, image, video, audio, document(Файл), slider(Презентация), table, code, formula, embed, button] },
  callout: { label: "Подсказки", items: [callout-info as "Callout-обёртка"] }, // одна карточка → откроет под-выбор
  interactive: { label: "Интерактив", items: [quiz, accordion, divider] },
  ai: { label: "ИИ", items: [ai-image, ai-audio, ai-quiz] },
}
```

### 6. Обновление иконок и `blockIconBg`
Для новых типов:
- `table` — Table icon, синий
- `button` — MousePointerClick, primary
- `embed` — Code2/Box, фиолетовый
- `code` — Code, зелёный
- `formula` — Sigma, оранжевый
- AI-карточки — со Sparkles, градиент primary

### 7. Файлы изменений
- `src/components/course-builder/block-editor/types.ts` — типы, конфиги, иконки, описания
- `src/components/course-builder/block-editor/blocks/AddBlockButton.tsx` — переработать категории (убрать `calloutItems`, добавить группу AI с особой обработкой клика)
- `src/components/course-builder/block-editor/blocks/BlockContent.tsx` — `case` для новых блоков
- `src/components/course-builder/block-editor/BlockRenderer.tsx` — рендер для просмотра
- `src/components/course-builder/block-editor/blocks/TableBlock.tsx` — новый
- `src/components/course-builder/block-editor/blocks/ButtonBlock.tsx` — новый
- `src/components/course-builder/block-editor/blocks/EmbedBlock.tsx` — новый
- `src/components/course-builder/block-editor/blocks/CodeBlock.tsx` — новый
- `src/components/course-builder/block-editor/blocks/FormulaBlock.tsx` — новый (зависимость `katex`)
- `supabase/functions/generate-block-image/index.ts` — новая edge-функция для AI-картинок через Lovable AI

### Результат
- Попап стал чистым, как у SkillSpace: 11 базовых + 3 интерактивных + 3 AI = 17 карточек в 4 колонки.
- Группа «Выделения» полностью убрана — её функции доступны через «Доп. оформление» при выделении текста.
- 5 новых типов блоков (Таблица, Кнопка, Embed, Код, Формула) полностью работают и отображаются в редакторе/превью/публикации.
- AI-генерация интегрирована прямо в попап выбора блока.

