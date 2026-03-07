

# Перенос кнопки выбора ИИ-провайдера

## Задача
- **Убрать** селектор ИИ-провайдера из `OrganizationDetailsView.tsx` (настройки организации, строки 1100-1124)
- **Добавить** в `OrganizationsManager.tsx` — в выпадающее меню действий организации (DropdownMenu) пункт для быстрого переключения провайдера

## Изменения

### 1. `OrganizationDetailsView.tsx`
Удалить блок строк 1100-1125 (AI Provider Select). Убрать `ai_provider` из `settings` state и из вызова `update`.

### 2. `OrganizationsManager.tsx`
В оба DropdownMenu (grid-режим ~строка 839, list-режим ~строка 1032) добавить пункт:

```tsx
<DropdownMenuItem onClick={() => toggleAiProvider(org)}>
  <Sparkles className="w-4 h-4 mr-2" />
  ИИ: {org.ai_provider === 'lovable_ai' ? 'Lovable AI → GigaChat' : 'GigaChat → Lovable AI'}
</DropdownMenuItem>
```

Функция `toggleAiProvider` — переключает значение в БД и обновляет локальный state:

```typescript
const toggleAiProvider = async (org: Organization) => {
  const newProvider = org.ai_provider === 'lovable_ai' ? 'gigachat' : 'lovable_ai';
  await supabase.from("organizations").update({ ai_provider: newProvider }).eq("id", org.id);
  // обновить список
};
```

Также на карточке/в списке можно показать маленький бейдж текущего провайдера рядом с названием организации.

### Файлы
| Файл | Что |
|------|-----|
| `src/components/admin/OrganizationDetailsView.tsx` | Удалить блок AI Provider Select |
| `src/components/admin/OrganizationsManager.tsx` | Добавить toggle в DropdownMenu + бейдж провайдера |

