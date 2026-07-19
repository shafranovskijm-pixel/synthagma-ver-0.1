# Автораспознавание СНИЛС по скану (Gemini 2.5 Flash Vision)

## Что делаем
При загрузке скана СНИЛС или паспорта в карточке ученика — сразу показываем распознанные номер СНИЛС и дату рождения с кнопкой «Применить». Функция доступна только на тарифах **Профессиональный** и **Максимальный**.

## Backend

### Edge Function: `supabase/functions/ocr-snils/index.ts`
- Принимает `{ file_path: string, doc_type: 'snils' | 'passport' }`.
- Проверяет JWT пользователя, находит его организацию, читает `subscription_plan` (+ `custom_ai_generations_limit` overrides) — если план не `professional`/`maximum`, возвращает 403 с понятным сообщением.
- Скачивает файл из приватного bucket `student-documents` через service role, конвертирует в base64.
- Вызывает Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) с моделью `google/gemini-2.5-flash`, передаёт изображение (`image_url` с data URL) + строгий system-prompt: «извлеки СНИЛС в формате XXX-XXX-XXX XX и дату рождения YYYY-MM-DD, верни JSON `{snils, birth_date, confidence}`».
- PDF: если MIME `application/pdf` — передаём через `type:"file"` блок (Gemini поддерживает PDF).
- Возвращает клиенту `{ snils, birth_date, confidence, raw }`.
- Обрабатывает 429/402 от gateway (лимиты/кредиты) и возвращает вменяемые ошибки.
- `verify_jwt = true` (по умолчанию для Cloud — не трогаем `config.toml`).

### Секреты
`LOVABLE_API_KEY` уже есть в проекте — новых секретов не нужно.

## Frontend

### `src/components/organization/student-detail/DocumentsTab.tsx`
- В блоке «Загруженные документы» для записей с `type === 'snils'` (и опционально `passport` — только дата рождения) добавляем кнопку «🔍 Распознать» рядом с «Просмотр»/«Удалить».
- Кнопка видна только когда `orgPlan === 'professional' || orgPlan === 'maximum'`. Иначе — кнопка с замком и тултипом «Доступно на тарифах Профессиональный и Максимальный».
- По клику: вызов `supabase.functions.invoke('ocr-snils', { body: { file_path, doc_type } })` со спиннером.
- Результат показываем в маленьком `AlertDialog`: «Найдено — СНИЛС: 123-456-789 01, Дата рождения: 01.01.1990. Применить?». Кнопки: «Применить оба», «Только СНИЛС», «Только дату», «Отмена».
- «Применить» вызывает существующий `h.saveFrdoField('snils', ...)` / `saveFrdoField('birth_date', ...)`.
- Предварительная клиентская валидация: `isValidSnils` + `isValidSnilsChecksum` перед сохранением; если контрольная сумма не сошлась — предупреждаем, но разрешаем сохранить.

### Опционально (в этом же PR)
После успешной загрузки скана СНИЛС автоматически один раз запускать распознавание в фоне (только для plan gate ok) — чтобы кнопка сразу показывала «Найдено: …».

## Тарифная логика
- `orgPlan` уже приходит из `useSubscriptionLimits(organizationId)` в `StudentDetailCard` — пробрасываем в `DocumentsTab` как проп.
- Двойная проверка: клиент (UX) + edge function (безопасность).

## Что НЕ трогаем
- Схему БД (никаких новых таблиц/колонок — результат сразу пишется в существующий `student_frdo_data`).
- Существующую загрузку/просмотр/удаление документов.
- Форматы `formatSnils` / валидаторы.

## Файлы
- Новый: `supabase/functions/ocr-snils/index.ts`
- Правка: `src/components/organization/student-detail/DocumentsTab.tsx`
- Правка: `src/components/organization/StudentDetailCard.tsx` (пробросить `orgPlan` в `DocumentsTab`)

## Модель
`google/gemini-2.5-flash` через Lovable AI Gateway — vision, дёшево, покрывается кредитами Lovable AI, отдельного API-ключа не требуется.
