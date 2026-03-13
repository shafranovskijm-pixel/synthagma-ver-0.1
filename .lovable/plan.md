

## План: Распределить курсы по типам программ на основе `parent_type`

### Проблема
В магазине организации и студента все подкатегории и курсы попадают в «Повышение квалификации», потому что `parent_type` не запрашивается из БД и не используется при группировке.

### Решение

Одинаковое исправление в двух файлах: **`src/hooks/useCourseStoreManager.ts`** и **`src/components/student/StudentCourseStore.tsx`**:

1. **Добавить `parent_type` в select и state**:
   - `select("id, name, order_index, parent_type")` вместо `select("id, name, order_index")`
   - Обновить тип state: добавить `parent_type: string | null`

2. **Переписать `groupedCatalog`** — распределить subGroups по `parent_type`:
   ```typescript
   const programTypes = [
     { category: "Повышение квалификации", badge: "ДПО" },
     { category: "Профессиональная переподготовка", badge: "ДПО" },
     { category: "Охрана труда / Пожарная безопасность", badge: "ОТ / ПБ" },
     { category: "Рабочие профессии", badge: "ПО" },
   ];

   return programTypes.map(pt => {
     const ptCategories = dbCategories.filter(
       cat => (cat.parent_type || "Повышение квалификации") === pt.category
     );
     const subGroups = ptCategories.map(cat => ({
       category: cat.name,
       courses: byCatId.get(cat.id) || [],
     }));
     const courses = subGroups.flatMap(g => g.courses);
     // Некатегоризированные — в «Повышение квалификации»
     if (pt.category === "Повышение квалификации") {
       courses.push(...uncategorized);
     }
     return { ...pt, courses, subGroups };
   });
   ```

### Файлы

| Файл | Изменение |
|---|---|
| `src/hooks/useCourseStoreManager.ts` | Добавить `parent_type` в fetch и group по parent_type |
| `src/components/student/StudentCourseStore.tsx` | То же самое |

