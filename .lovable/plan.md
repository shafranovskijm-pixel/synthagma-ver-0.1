

# Общий чат, уведомления и звуки в чатах

## Что будет сделано

### 1. Общий чат организации
Новый групповой чат ниже «Администрация платформы» в списке — все сотрудники организации видят одну общую переписку.

**Миграция**: Таблица `org_general_messages` (id, organization_id, sender_user_id, content, attachment_url, attachment_name, attachment_type, created_at) с RLS — чтение/запись только для участников организации. Realtime включён.

**Компонент**: `OrgGeneralChat.tsx` — аналог AdminChatDialog, но для всех членов организации. Каждое сообщение показывает аватар и имя отправителя (в отличие от 1-на-1 чатов).

**Интеграция**: В `OrgChatsTab.tsx` добавить кнопку «Общий чат» между «Администрация» и списком студентов с иконкой Users.

### 2. Кнопка мьюта (Bell/BellOff) на каждом чате
Компонент `ChatNotificationToggle` уже существует и работает с таблицей `chat_notification_settings`.

Добавить его в заголовок открытого чата (рядом с именем собеседника) в:
- `OrgChatsTab.tsx` — в шапке desktop-чата (строка ~204-217)
- `AdminChatsManager.tsx` — в шапке чата
- `ColleagueChatPanel.tsx` — в шапке чата

### 3. Звуковые уведомления при новых сообщениях
**Хук `useChatSound.ts`**: Воспроизводит звук при получении нового сообщения через realtime-канал. Проверяет `chat_notification_settings.muted` перед воспроизведением.

**Звуковые файлы**: 5 вариантов в `public/sounds/` (message-1.mp3 ... message-5.mp3) — короткие синтезированные звуки, сгенерированные программно.

### 4. Настройки звука в ChatSettingsPanel
Добавить в существующий `ChatSettingsPanel.tsx`:
- Переключатель «Звук уведомлений» (вкл/выкл) 
- Выбор мелодии из 5 вариантов с кнопкой предпрослушивания
- Сохранение в `chat_notification_settings` (chat_type = "global", chat_partner_id = null)

**Миграция**: Добавить колонку `notification_sound` (text, default 'message-1') в `chat_notification_settings`.

## Файлы

| Действие | Файл |
|----------|------|
| Миграция | `org_general_messages` таблица + RLS + realtime |
| Миграция | `notification_sound` колонка в `chat_notification_settings` |
| Создать | `src/components/chat/OrgGeneralChat.tsx` |
| Создать | `src/hooks/useChatSound.ts` |
| Создать | `public/sounds/message-1.mp3` ... `message-5.mp3` |
| Изменить | `src/components/organization/OrgChatsTab.tsx` — общий чат + bell toggle |
| Изменить | `src/components/chat/ChatSettingsPanel.tsx` — звуковые настройки |
| Изменить | `src/components/admin/AdminChatsManager.tsx` — bell toggle |
| Изменить | `src/components/chat/ColleagueChatPanel.tsx` — bell toggle |

