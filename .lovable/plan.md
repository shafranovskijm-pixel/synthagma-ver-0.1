

## Исправление: медиатека не показывает видео

### Причина проблемы

Текущий пользователь (`admin@demo.sigma`) имеет `organization_id = null` в таблице `profiles`. Из-за этого функция `getOrgCourseIds()` не может найти курсы организации и возвращает пустой массив. Внешнее хранилище (`course-videos`) не опрашивается, и видео не отображаются.

Кроме того, RPC `get_user_storage_files` запрашивает только бакет `course-files`, а видео загружаются в бакет `course-videos` на внешнем Supabase.

### Решение

**1. Изменить `getOrgCourseIds` — добавить fallback по создателю курса**

Если `organization_id` пустой, искать курсы, созданные текущим пользователем (`created_by = auth.uid()`). Это покроет случай администратора без привязки к организации.

**2. Также запрашивать `course-videos` через RPC на основном Supabase**

Видео могли быть загружены и в основной бакет `course-videos` (если он существует). Нужно вызвать RPC и для этого бакета тоже.

### Технические изменения

**Файл: `src/components/course-builder/MediaLibraryDialog.tsx`**

Изменить функцию `getOrgCourseIds`:

```typescript
const getOrgCourseIds = async (): Promise<string[]> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // 1. Попробовать через organization_id
  if (organizationId) {
    const { data } = await supabase.from("courses").select("id").eq("organization_id", organizationId);
    if (data && data.length > 0) return data.map(c => c.id);
  }

  // 2. Fallback: через organization_id из профиля
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.organization_id) {
    const { data } = await supabase.from("courses").select("id").eq("organization_id", profile.organization_id);
    if (data && data.length > 0) return data.map(c => c.id);
  }

  // 3. Fallback: курсы, созданные текущим пользователем
  const { data: userCourses } = await supabase.from("courses").select("id").eq("created_by", user.id);
  return userCourses?.map(c => c.id) || [];
};
```

Также в `loadFiles` — добавить вызов RPC для бакета `course-videos` (на случай если видео хранятся на основном Supabase):

```typescript
// Дополнительно: файлы пользователя из course-videos (если бакет существует на основном Supabase)
const { data: videoFiles } = await supabase.rpc("get_user_storage_files", {
  bucket_name: "course-videos",
});
// ... обработка аналогично course-files
```

Это гарантирует что видео будут найдены независимо от того, есть ли у пользователя привязка к организации.
