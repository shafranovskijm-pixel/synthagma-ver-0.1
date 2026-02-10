

# Инлайн-редактирование главной страницы (Ctrl + правый клик)

## Что будет сделано

Администратор сможет редактировать тексты на главной странице прямо на месте: зажать Ctrl и нажать правую кнопку мыши на любом редактируемом элементе -- появится попап с полем ввода, где можно изменить текст и сохранить его в базу данных. Изменения сохраняются и отображаются для всех посетителей.

## Как это будет работать

1. При загрузке страницы проверяется, авторизован ли пользователь и является ли он админом
2. Если да -- все редактируемые тексты оборачиваются в компонент `InlineEditable`, который при Ctrl+ПКМ показывает попап редактирования
3. Тексты загружаются из таблицы `landing_content` в базе данных; если записи нет -- используется значение по умолчанию из кода
4. При сохранении текст записывается в базу и обновляется на странице без перезагрузки

## Редактируемые элементы

- **Hero**: заголовок, подзаголовок, текст кнопки, бейдж
- **Features**: заголовок секции, подзаголовок, названия и описания каждой фичи
- **EditorDemo**: заголовок, подзаголовок
- **Roadmap**: заголовок, подзаголовок
- **Testimonials**: заголовок, подзаголовок
- **CostCalculator**: заголовок, подзаголовок
- **CTA**: заголовок, подзаголовок, текст кнопки
- **Footer**: описание компании

## Технические детали

### 1. Новая таблица `landing_content`

```sql
CREATE TABLE landing_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key TEXT UNIQUE NOT NULL,
  content_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS: чтение для всех, запись только для админов
ALTER TABLE landing_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read landing content"
  ON landing_content FOR SELECT USING (true);

CREATE POLICY "Admins can update landing content"
  ON landing_content FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
```

### 2. Новый компонент `InlineEditable`

Файл: `src/components/landing/InlineEditable.tsx`

- Принимает `contentKey`, `defaultValue`, `children` (render prop)
- Подписывается на контекст `LandingContentContext` для получения текущего значения
- При Ctrl+ПКМ предотвращает стандартное контекстное меню и показывает `Popover` с `<textarea>` и кнопками "Сохранить" / "Отмена"
- При сохранении делает `upsert` в `landing_content` и обновляет контекст

### 3. Контекст `LandingContentProvider`

Файл: `src/components/landing/LandingContentContext.tsx`

- При монтировании загружает все записи из `landing_content`
- Проверяет авторизацию: если пользователь -- админ, устанавливает `isAdmin = true`
- Предоставляет функцию `getValue(key, defaultValue)` и `updateValue(key, value)`
- Оборачивает страницу `Index` целиком

### 4. Изменения в компонентах

Каждый landing-компонент (Hero, Features, CTA и т.д.) получит обёртки `InlineEditable` вокруг редактируемых текстов. Пример:

```tsx
// Было:
<h1>Обучение и документы</h1>

// Стало:
<InlineEditable contentKey="hero_title" defaultValue="Обучение и документы">
  {(value) => <h1>{value}</h1>}
</InlineEditable>
```

Для обычных посетителей компонент просто рендерит текст без каких-либо дополнительных обработчиков -- никакого визуального отличия.

### 5. Визуальная индикация для админа

- При наведении с зажатым Ctrl на редактируемый элемент -- тонкая пунктирная рамка `border-dashed border-accent/50`
- Попап редактирования: `textarea` + кнопки, позиционирование через `Popover` из shadcn/ui
- После сохранения -- `toast` "Сохранено"

### Файлы

| Файл | Действие |
|---|---|
| `src/components/landing/LandingContentContext.tsx` | Новый |
| `src/components/landing/InlineEditable.tsx` | Новый |
| `src/pages/Index.tsx` | Обернуть в `LandingContentProvider` |
| `src/components/landing/Hero.tsx` | Добавить `InlineEditable` |
| `src/components/landing/Features.tsx` | Добавить `InlineEditable` |
| `src/components/landing/EditorDemo.tsx` | Добавить `InlineEditable` |
| `src/components/landing/Roadmap.tsx` | Добавить `InlineEditable` |
| `src/components/landing/Testimonials.tsx` | Добавить `InlineEditable` |
| `src/components/landing/CostCalculator.tsx` | Добавить `InlineEditable` |
| `src/components/landing/CTA.tsx` | Добавить `InlineEditable` |
| `src/components/landing/Footer.tsx` | Добавить `InlineEditable` |
| База данных | Создать таблицу `landing_content` с RLS |

