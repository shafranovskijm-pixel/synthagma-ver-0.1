

## Аудит кода чат-виджета поддержки и связанных компонентов

После просмотра всех изменений за последние сессии (`SupportChatWidget.tsx`, `useChatTheme.ts`, `ChatThemePicker.tsx`, `Aurora.tsx`, `Waves.tsx`, `StarfieldCanvas.tsx`, `SigmaLogo.tsx`, `appVersion.ts`) нашёл несколько проблем разной критичности.

### 🔴 Критичные (видны в console)

**1. React warning: «Function components cannot be given refs»**
В консоли два предупреждения — `HeaderBackground` и `HomeView`/`SigmaLogo` получают ref'ы через Radix Tooltip / Popover, но не обёрнуты в `forwardRef`.
- Корень: `HeaderBackground` сейчас обычная функция. Когда снаружи к нему пытаются прокинуть ref (например, в композиции с Tooltip), ломается.
- **Фикс:** переписать `HeaderBackground` на `React.forwardRef`. Аналогично — обернуть `SigmaLogo` в `forwardRef`, т.к. он может использоваться как `asChild` в Radix-кнопках.

**2. Бесконечный/двойной ре-рендер кнопки чата**
В session replay видно, что DOM-узел кнопки FAB пересоздаётся ровно в момент клика (id 5093 → 6461 → 6531). Это значит компонент `SupportChatWidget` пересобирается полностью при каждом изменении состояния где-то выше. Скорее всего, виноват `BackgroundUploadsProvider` или `AuthProvider`, который ре-рендерит детей. Это объясняет, почему кнопка «Свернуть» иногда визуально не реагирует — она исчезает и появляется в новом DOM-узле, click-event теряется.
- **Фикс:** обернуть `SupportChatWidget` в `React.memo`, и/или мемоизировать `value` контекстов в `BackgroundUploadsProvider`/`AuthProvider`.

### 🟡 Средние (тех. долг)

**3. SupportChatWidget.tsx раздут до 628 строк**
Один файл содержит: главный виджет, `HomeView`, `ChatView`, `VersionFooter`, `HeaderBackground`, утилиты `getGuestToken`/`detectSource`. Это мешает читабельности и блокирует tree-shaking.
- **Фикс:** разнести на:
  - `SupportChatWidget.tsx` (контейнер + state)
  - `support/HomeView.tsx`
  - `support/ChatView.tsx`
  - `support/VersionFooter.tsx`
  - `support/HeaderBackground.tsx`
  - `support/utils.ts` (guest token, detect source)

**4. Дублирование пропсов между `HomeView` и `ChatView`**
Оба принимают `themeId/setThemeId/bgId/setBgId` — 4 пропса повторяются. Внутри обоих рендерится `ChatThemePicker` с теми же аргументами.
- **Фикс:** вынести `useChatTheme()` напрямую внутрь `ChatThemePicker` (хук уже читает из localStorage), убрать пропсы из `HomeView`/`ChatView`. Получим API: `<ChatThemePicker />` без аргументов.

**5. Лишние ре-рендеры из-за `messages` в зависимостях useEffect**
`useEffect` на строке 175 срабатывает при каждом новом сообщении и каждом тике таймера, делая `scrollIntoView`. На больших чатах — заметная нагрузка.
- **Фикс:** разделить на 2 эффекта: один для скролла (зависит только от `messages.length`), другой для unread (зависит от `open`, `view`, `unread`).

**6. `setTimeout(handleSend, 100)` в `requestOperator`**
Хрупкая логика: устанавливает state и через таймер отправляет. Если пользователь успеет нажать что-то ещё — будет race condition.
- **Фикс:** переписать `handleSend` так, чтобы он принимал текст параметром: `handleSend(text?: string)`. Тогда `requestOperator` вызывает `handleSend('Прошу связать...')` напрямую без таймера и без мутации `input`.

### 🟢 Полезные улучшения

**7. APP_VERSION хранится только в коде**
Сейчас версия — константа в `appVersion.ts`. Чтобы поднимать её при каждом релизе, нужно вручную править файл.
- **Фикс:** автоподстановка через Vite `define` из `package.json` версии. Тогда `1.0.01` будет браться автоматически. Альтернатива — оставить ручное обновление, но добавить в README напоминание. Для простоты пока оставим вручную, но добавлю short SHA build date в подпись (например `v1.0.01 · 20.04`), чтобы клиент сразу понимал, насколько свежий билд.

**8. StarfieldCanvas: тяжёлая отрисовка для маленькой шапки 380×176**
180 звёзд + 4 туманности + shooting stars каждые 3 сек — это для большого hero-секции. Внутри чата перебор — лагает на слабых девайсах.
- **Фикс:** добавить пропс `density?: 'low' | 'high'` (default `high`). В чате передавать `density="low"` → 50 звёзд, без туманностей.

**9. `@ts-expect-error CSS var` в трёх местах**
Можно заменить на чистый тип: `style={{ ...({ "--chat-accent": theme.accent } as React.CSSProperties) }}` или объявить глобальный `CSSPropertiesWithVars`. Мелочь, но убирает шум в коде.

**10. ChatThemePicker — кнопка palette перекрывает звёзды**
Когда фон — звёзды, цветные шарики палитры в popover'е плохо контрастируют с белым фоном popover'a (он `bg-popover`). Стоит добавить тонкий border на activе-индикаторе, чтобы светло-бирюзовый шарик был лучше виден на светлой теме.

### План работ (по приоритету)

1. **Критичные фиксы** (1, 2): `forwardRef` для `HeaderBackground` и `SigmaLogo`, мемоизация виджета. Это устранит React warnings и случаи «кнопка не реагирует».
2. **Рефакторинг** (3, 4): разнести файл на 5 модулей, убрать дублирование пропсов через прямое использование `useChatTheme` в `ChatThemePicker`.
3. **Логика** (5, 6): разделить useEffect, переписать `handleSend(text?)`.
4. **Полировка** (7–10): density для звёзд, дата билда в подписи, чистка `@ts-expect-error`.

### Файлы

- `src/components/support/SupportChatWidget.tsx` — основной рефакторинг + memo
- `src/components/support/HomeView.tsx` *(новый)*
- `src/components/support/ChatView.tsx` *(новый)*
- `src/components/support/HeaderBackground.tsx` *(новый, с forwardRef)*
- `src/components/support/VersionFooter.tsx` *(новый)*
- `src/components/support/utils.ts` *(новый)*
- `src/components/support/ChatThemePicker.tsx` — убрать пропсы, использовать хук
- `src/components/landing/StarfieldCanvas.tsx` — добавить prop `density`
- `src/components/ui/SigmaLogo.tsx` — обернуть в forwardRef
- `src/lib/appVersion.ts` — добавить дату билда

### Результат

- Уйдут React warnings из консоли
- Кнопка «Свернуть» перестанет «теряться» из-за пересоздания DOM-узла
- Файл виджета сократится с 628 до ~200 строк, остальные части станут переиспользуемыми
- Производительность звёздного фона в чате вырастет в ~3 раза
- Код станет проще поддерживать при добавлении новых тем/анимаций

