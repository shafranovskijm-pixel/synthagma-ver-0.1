

## Перенос настроек меню из localStorage в базу данных

### Проблема
Настройки меню (Разделы меню) хранятся в **localStorage** браузера, а не в базе данных. Это значит:
- При входе с другого устройства/браузера — настройки сбрасываются
- При очистке кеша — настройки теряются
- Все организации на одном браузере делят одни настройки

На скриншоте у Авроры все категории включены в БД (`students=true`, все 12 категорий `true`), тариф «Максимальный» — проблем с доступом нет. Но если клиент зашёл с нового браузера, localStorage пустой и дефолтные значения могут отличаться от ожидаемых.

### Решение
Сохранять `menu_settings` в таблице `organizations` (JSONB-колонка) и загружать оттуда при старте.

### План

**1. Миграция БД** — добавить колонку `menu_settings` (JSONB, default `{}`) в таблицу `organizations`.

**2. `useDashboardSettings.ts`** — при загрузке:
- Читать `menu_settings` из `organizations` вместо localStorage
- При сохранении — записывать в БД через `supabase.from('organizations').update()`
- Оставить localStorage как fallback для обратной совместимости: при первой загрузке, если в БД пусто, мигрировать из localStorage в БД

**3. `SettingsTab.tsx`** — `handleSaveMenuSettings`:
- Записывать в БД вместо localStorage
- Показывать toast при успехе/ошибке

### Дефолтные значения
Все основные пункты (`showCourses`, `showCompanies`, `showStudents`, `showJournals`, `showFrdo`) по умолчанию `true` (через проверку `!== false`). Дополнительные (`showStats`, `showLinks`, `showDocuments`) по умолчанию `false`. `showLibrary` и `showServices` по умолчанию `true`.

### Файлы
| Файл | Действие |
|------|----------|
| Миграция БД | `ALTER TABLE organizations ADD COLUMN menu_settings JSONB DEFAULT '{}'` |
| `src/hooks/useDashboardSettings.ts` | Загрузка/сохранение из БД + миграция из localStorage |
| `src/components/organization/tabs/SettingsTab.tsx` | Обновить `handleSaveMenuSettings` для записи в БД |

