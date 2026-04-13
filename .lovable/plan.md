

# Два исправления: цена курса + "Организация не найдена"

## Проблема 1: Нет цены на странице курса

В `CoursePageSettingsContent.tsx` нет поля для управления ценой. Таблица `courses` имеет столбец `price` (numeric), но он не используется в настройках страницы курса. Также есть `marketplace_courses` с `price_student` и `price_organization`, но это отдельная система маркетплейса.

### Решение
Добавить в `CoursePageSettingsContent.tsx` на вкладку "Страница":
- Поле "Цена курса (₽)" — числовое, читает/записывает `courses.price`
- Загружать `price` вместе с `slug, accent_color, landing_content`
- Сохранять `price` вместе с остальными настройками
- Показать подсказку: "0 = бесплатный курс"

### Файл
- `src/components/course-editor/CoursePageSettingsContent.tsx`

---

## Проблема 2: "Организация не найдена" в настройках профиля

Консоль показывает: запрос профиля возвращает 0 строк (PGRST116). Это значит, что для текущего пользователя нет записи в `profiles`. В продакшне это может происходить, если профиль не был создан при регистрации.

### Решение
В `OrganizationProfile.tsx` сделать загрузку `organizationId` более устойчивой:
- Если профиль не найден — попробовать загрузить `organization_id` через `organizations` напрямую (где `owner_id = user.id`)
- Если и там нет — показать более информативное сообщение вместо просто "Организация не найдена"
- Добавить кнопку "Повторить" для перезагрузки данных

### Файл
- `src/pages/OrganizationProfile.tsx`

---

## Технические детали

### CoursePageSettingsContent.tsx
```
// loadData: добавить price в select
supabase.from("courses").select("slug, accent_color, landing_content, price")

// handleSave: добавить price в update
.update({ slug, accent_color, landing_content, price })

// UI: новое поле после "Акцентный цвет"
<Label>Цена курса (₽)</Label>
<Input type="number" value={price} ... />
```

### OrganizationProfile.tsx
```
// Fallback: если profile не нашёлся, искать через organizations
const { data: org } = await supabase
  .from("organizations")
  .select("id")
  .eq("owner_id", user.id)
  .single();
if (org) setOrganizationId(org.id);
```

