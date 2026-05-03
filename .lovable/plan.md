## Проблема

1. **Краш дашборда организации** — `useOrganizationCore.ts` создаёт канал с именем `org-core-${organizationId}` без уникального суффикса. При StrictMode/быстром ремаунте старый канал ещё не удалён, а новый пытается зарегистрировать `.on()` на уже подписанном канале → ошибка `cannot add postgres_changes callbacks ... after subscribe()`. Тот же баг я уже починил в `useSubscriptionLimits` — теперь нужно применить тот же приём по всему проекту.
2. **«Кидает в ученика»** — это **следствие**: `OrgDashboardProvider` падает в Error Boundary, и пользователь видит запасной маршрут / закэшированную роль `student` в `localStorage('user_role')`. Когда ошибка realtime уйдёт, дашборд организации откроется штатно.

## Что делаю

### 1. Чиним `useOrganizationCore.ts` (главный виновник текущего краша)
Добавляю уникальный суффикс к имени канала + try/catch вокруг `removeChannel`, по образцу уже исправленного `useSubscriptionLimits`:
```ts
const uniqueId = `${organizationId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
const channel = supabase.channel(`org-core-${uniqueId}`);
channel.on('postgres_changes', {...}, ...).subscribe();
return () => { try { supabase.removeChannel(channel); } catch {} };
```

### 2. Глобальный аудит каналов без уникального суффикса
Применяю тот же паттерн ко всем хукам/компонентам, где имя канала строится только из стабильного id (то есть может коллидировать при ремаунте):

- `src/hooks/useOrgUnreadChats.ts` — `org-chats-${organizationId}`
- `src/hooks/useOrgTheme.ts` — `org-theme:${organizationId}`
- `src/hooks/useStudentSignatureInbox.ts` — `student-inbox-${userId}`
- `src/hooks/useCourseGenerationProgress.ts` — `course-progress-${courseId}`
- `src/hooks/useSupportUnread.ts` — `support-unread-admin`
- `src/hooks/useAdminUnreadChats.ts` — `admin-unread-chats`
- `src/pages/StudentDashboard.tsx` — `dash-inbox-${user.id}`
- `src/pages/AdminDashboard.tsx` — `admin-notifications-bell`
- `src/components/admin/AdminSupportChats.tsx` — `admin-support-list`, `admin-conv-${activeId}`
- `src/components/admin/AdminChatsManager.tsx` — `admin-chat-${selectedOrgId}`
- `src/components/organization/OrgChatsTab.tsx` — `org-admin-unread-${organizationId}`
- `src/components/organization/AdminChatDialog.tsx` — `org-admin-chat-${organizationId}`
- `src/components/organization/OrgNotifications.tsx` — `org_notifications`
- `src/components/organization/student-detail/ChatTab.tsx` — `chat-${organizationId}-${studentUserId}`
- `src/components/student/StudentOrgChat.tsx` — `student-chat-${organizationId}-${studentUserId}`
- `src/components/support/SupportChatWidget.tsx` — `support-msg-${conversationId}`
- `src/components/chat/OrgGeneralChat.tsx`, `ColleagueChatPanel.tsx`, `ChatGroupsPanel.tsx`
- `src/components/company/CompanyRequestsTab.tsx` — `company_requests_realtime`
- `src/components/shared/AnnouncementsBell.tsx` — `platform-announcements-bell`
- `src/components/webinars/RecordingControls.tsx` — `rec-${webinarId}`
- `src/components/webinars/EmbeddedWebinarPlayer.tsx` — `webinar-embed-${webinarId}`

(WebinarQAPanel/PollsPanel/ChatPanel и `useSubscriptionLimits` уже используют уникальные суффиксы — их не трогаю.)

Каждое место правится по одному шаблону:
- имя канала → `…-${id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
- cleanup `removeChannel` оборачивается в try/catch.

### 3. Проверка маршрутизации ролей
После фикса краша:
- открыть `/organization` под учёткой организации — должен загрузиться кабинет;
- если по какой-то причине роль в `localStorage` устарела (`user_role=student`), это скорректирует `fetchUserRole` через RPC `get_user_role` при следующем входе. Логику `ProtectedRoute` менять не требуется — она корректна.

## Записать в memory
Добавлю короткое правило в `mem://architecture/realtime-channel-uniqueness`: realtime-каналы Supabase ВСЕГДА именуются с суффиксом `${Date.now()}-${rand}`, иначе StrictMode/ремаунты ловят `cannot add postgres_changes after subscribe()`.

## Технические детали
- Файлов трогаю ~22, изменения механические: имя канала + try/catch в cleanup.
- Поведение realtime не меняется: каждый клиент получает уникальный канал, фильтр по `filter:` остаётся прежним, нагрузка на Realtime сервер та же.
- Риски: минимальные. Уникальные имена — это рекомендованный паттерн supabase-js v2 для устранения race conditions при ремаунте.
