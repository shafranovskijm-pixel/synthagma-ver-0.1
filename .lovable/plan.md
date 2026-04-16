

# Унификация чатов: ИИ-помощник + Чат с коллегами для всех ролей

## Текущее состояние
- **Слушатели**: Чат с учебным центром + ИИ-помощник (готово)
- **Организации**: Чат со слушателями + Чат с администрацией платформы
- **Админы**: Чат с организациями

## Что будет после изменений

| Роль | Чаты |
|------|------|
| **Слушатели** | Чат с учебным центром + ИИ-помощник (без изменений) |
| **Организации** | Чат со слушателями + Чат с администрацией + **ИИ-помощник** + **Чат с коллегами** (сотрудники org_staff + другие организации) |
| **Админы** | Чат с организациями + **ИИ-помощник** + **Чат с коллегами** (все организации и слушатели — общий канал) |

## Реализация

### 1. Миграция: таблица colleague_messages
Новая таблица для чата между коллегами (1-на-1 сообщения):

```sql
CREATE TABLE public.colleague_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text,
  attachment_url text,
  attachment_name text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

RLS: пользователь видит и отправляет только свои сообщения. Realtime включен.

### 2. Миграция: таблица chat_notification_settings
Настройки уведомлений по чатам (вкл/выкл уведомления):

```sql
CREATE TABLE public.chat_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_type text NOT NULL, -- 'colleague', 'org_student', 'admin', 'ai'
  chat_partner_id uuid, -- конкретный собеседник или NULL для типа в целом
  muted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, chat_type, chat_partner_id)
);
```

### 3. ИИ-помощник для организаций и админов
Переиспользовать edge-функцию `student-chat` — она уже принимает контекст и работает с авторизацией. Создать общий компонент `AiChatPanel` для использования во всех дашбордах.

### 4. Компонент ColleagueChatPanel
Новый компонент для чата с коллегами:
- Список собеседников (для орг — сотрудники org_staff + другие орги; для админов — все пользователи)
- Поиск по имени
- Отправка текста и вложений
- Realtime через postgres_changes

### 5. Компонент ChatNotificationToggle
Кнопка mute/unmute для каждого чата (иконка колокольчика).

### 6. Обновление OrgChatsTab
Добавить два новых варианта в список чатов:
- **ИИ-помощник** — открывает AiChatPanel
- **Чат с коллегами** — открывает ColleagueChatPanel
Сохранить существующие чаты со слушателями и администрацией.

### 7. Обновление AdminChatsManager
Добавить в интерфейс:
- **ИИ-помощник** — AiChatPanel
- **Чат с коллегами** — ColleagueChatPanel (доступ ко всем пользователям)
Сохранить существующий чат с организациями.

### 8. Компонент переключения режимов
В каждом чат-разделе добавить tabs/кнопки переключения между режимами чата (аналогично тому, как у слушателей сейчас есть "Выберите чат").

## Файлы

| Действие | Файл |
|----------|------|
| Миграция | `colleague_messages` + `chat_notification_settings` |
| Создать | `src/components/chat/AiChatPanel.tsx` — общий ИИ-чат |
| Создать | `src/components/chat/ColleagueChatPanel.tsx` — чат с коллегами |
| Создать | `src/components/chat/ChatNotificationToggle.tsx` — кнопка mute |
| Создать | `src/hooks/useColleagueChat.ts` — логика чата с коллегами |
| Создать | `src/hooks/useChatNotifications.ts` — настройки уведомлений |
| Изменить | `src/components/organization/OrgChatsTab.tsx` — добавить ИИ + коллеги |
| Изменить | `src/components/admin/AdminChatsManager.tsx` — добавить ИИ + коллеги |

