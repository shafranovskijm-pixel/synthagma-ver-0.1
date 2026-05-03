---
name: Realtime Channel Uniqueness
description: Realtime-каналы Supabase ВСЕГДА именуются с уникальным суффиксом ${Date.now()}-${rand} — иначе StrictMode/ремаунты ловят ошибку cannot add postgres_changes after subscribe()
type: constraint
---

Все вызовы `supabase.channel(name)` в проекте обязаны добавлять к имени уникальный суффикс:

```ts
const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
supabase.channel(`my-feature-${stableId}-${uniqueId}`)
  .on('postgres_changes', {...}, ...)
  .subscribe();
```

**Why:** при StrictMode и быстром ремаунте старый канал ещё не успевает удалиться через `removeChannel`, а новый монтируется с тем же именем и пытается зарегистрировать `.on()` поверх уже подписанного канала. Это ловится supabase-js как `cannot add postgres_changes callbacks for realtime:<name> after subscribe()` и крашит дерево через ErrorBoundary.

**How to apply:**
- Никогда не используй стабильное имя канала (`org-core-${id}`, `admin-bell` и т.п.) — всегда добавляй суффикс времени+рандома.
- Cleanup `removeChannel` оборачивай в try/catch, чтобы повторный анмаунт не падал.
- Уже исправлено: `useOrganizationCore`, `useSubscriptionLimits`, `useOrgUnreadChats`, `useOrgTheme`, `useStudentSignatureInbox`, `useCourseGenerationProgress`, `useSupportUnread`, `useAdminUnreadChats`, `StudentDashboard`, `AdminDashboard`, `AdminSupportChats`, `AdminChatsManager`, `OrgChatsTab`, `AdminChatDialog`, `OrgNotifications`, `ChatTab` (student-detail), `StudentOrgChat`, `SupportChatWidget`, `OrgGeneralChat`, `ColleagueChatPanel`, `ChatGroupsPanel`, `CompanyRequestsTab`, `AnnouncementsBell`, `RecordingControls`, `EmbeddedWebinarPlayer`.
