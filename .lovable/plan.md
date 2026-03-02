

# Plan: Add "Chats" Section to Organization Sidebar

## Overview
Add a centralized "Chats" tab in the organization sidebar that shows all student conversations with unread message indicators, allowing the organization to quickly find and respond to messages without navigating through individual student profiles.

## Changes

### 1. Add "chats" tab type
- **File**: `src/components/organization/OrgSidebar.tsx`
- Add `"chats"` to the `TabType` union
- Add a sidebar button with `MessageCircle` icon and an unread count badge

### 2. Create unread messages hook
- **New file**: `src/hooks/useOrgUnreadChats.ts`
- Query `org_student_messages` where `is_read = false` and `sender_user_id != currentUserId` (i.e., messages FROM students)
- Group by `student_user_id` to get per-student unread counts and total unread count
- Subscribe to realtime updates on `org_student_messages` for live badge updates

### 3. Create OrgChatsTab component
- **New file**: `src/components/organization/OrgChatsTab.tsx`
- Show a list of all students who have sent/received messages, sorted by last message time
- Each item shows: student name (from profiles), last message preview, timestamp, unread badge
- Clicking a conversation opens the existing `ChatTab` component inline
- Search/filter by student name

### 4. Register tab in TabContentRenderer
- **File**: `src/components/organization/tabs/TabContentRenderer.tsx`
- Add rendering for `activeTab === "chats"`

### 5. Register tab in useTabNavigation
- **File**: `src/hooks/useTabNavigation.ts`
- Add `"chats"` to `getVisibleTabs()` (always visible, placed after "students")

## Technical Details

### Unread Count Query
```sql
SELECT student_user_id, COUNT(*) as unread_count
FROM org_student_messages
WHERE organization_id = :orgId
  AND sender_user_id = student_user_id  -- sent by student, not by org
  AND is_read = false
GROUP BY student_user_id
```

### Conversation List Query
```sql
-- Get distinct conversations with last message
SELECT DISTINCT ON (student_user_id)
  student_user_id, content, created_at, is_read, sender_user_id
FROM org_student_messages
WHERE organization_id = :orgId
ORDER BY student_user_id, created_at DESC
```

Student names will be fetched by joining with profiles table.

### Realtime
Subscribe to `org_student_messages` INSERT events to update the unread badge in real-time without page refresh.

### UI Layout
- Left panel: conversation list with search, unread badges, last message preview
- Right panel: selected conversation using existing `ChatTab` component
- On mobile: full-screen list, tap to open conversation, back button to return

