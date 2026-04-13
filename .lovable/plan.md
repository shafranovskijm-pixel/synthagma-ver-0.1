

# Кнопка «Выставить счёт» + кастомные возможности для индивидуальных тарифов

## 1. Кнопка «Выставить счёт» — всегда видна

Сейчас карточка с кнопкой «Выставить счёт» показывается только когда до конца тарифа ≤ 30 дней. Уберём это ограничение — кнопка будет доступна для всех платных тарифов всегда.

**Файл:** `src/components/organization/SubscriptionTab.tsx` (строка 290)
- Убрать условие `daysRemaining !== null && daysRemaining <= 30`
- Оставить только `currentPlan !== 'free'`

---

## 2. Кастомные категории возможностей в админке

### Проблема
Сейчас в `useOrgFeatures` подписочный план **жёстко перезаписывает** все org-specific настройки категорий (строки 280-291). Даже если в таблице `organization_feature_categories` прописано `webinars = true`, план всё равно перетрёт это значение.

### Решение

#### A. Добавить колонку `custom_enabled_categories` в таблицу `organizations`
JSON-массив строк (например `["webinars", "labor_safety"]`). Если непустой — эти категории будут **добавлены** к тем, что идут от плана.

**Миграция:**
```sql
ALTER TABLE organizations ADD COLUMN custom_enabled_categories text[] DEFAULT '{}';
```

#### B. Обновить `useOrgFeatures.ts` (строки 280-291)
После применения плановых категорий — дополнительно включить категории из `custom_enabled_categories`:
```
// После планового цикла:
if (orgData.custom_enabled_categories) {
  for (const cat of orgData.custom_enabled_categories) {
    if (cat in newFeatures) newFeatures[cat] = true;
  }
}
```

#### C. Добавить UI в админке — `OrganizationDetailsView.tsx` (вкладка «Тарифы»)
После секции «Индивидуальные лимиты» добавить новую карточку «Индивидуальные возможности» с чекбоксами:

| Категория | Ключ |
|---|---|
| Журналы | `journals` |
| Документооборот | `documents` |
| Охрана труда | `labor_safety` |
| Магазин курсов | `services` |
| ФИС ФРДО | `frdo` |
| ИИ-генерация | (отдельный флаг через `aiEnabled`) |
| Вебинары | `webinars` |
| 3D-тренажёры | новая категория `3d_trainers` |

Каждый чекбокс сохраняется в `custom_enabled_categories`. Отмеченные категории будут доступны организации **независимо от тарифа**.

#### D. Обновить SubscriptionTab — секция «Возможности на старших тарифах»
Если категория включена через `custom_enabled_categories`, не показывать её в блоке «доступные на старших тарифах» (она уже разблокирована).

---

## Затрагиваемые файлы
- Миграция: добавить `custom_enabled_categories` в `organizations`
- `src/hooks/useOrgFeatures.ts` — учитывать кастомные категории
- `src/components/admin/OrganizationDetailsView.tsx` — UI чекбоксов в «Тарифах»
- `src/components/organization/SubscriptionTab.tsx` — убрать условие для кнопки счёта + фильтрация feature highlights

