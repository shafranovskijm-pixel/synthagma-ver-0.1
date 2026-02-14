
## Исправление навигации "Назад" для админа в конструкторе курсов

### Проблема
При редактировании курса из админ-панели кнопка "Назад" всегда ведёт на `/organization`, потому что путь захардкожен в хуке `useCourseBuilder.ts`.

### Решение
Проверять наличие `adminViewAsOrg` в `localStorage` и направлять админа обратно на `/admin` вместо `/organization`.

### Технические изменения

**Файл:** `src/hooks/useCourseBuilder.ts`

1. Добавить вспомогательную функцию определения пути возврата:
   ```ts
   const getBackPath = () => {
     const adminView = localStorage.getItem("adminViewAsOrg");
     return adminView ? "/admin" : "/organization";
   };
   ```

2. Обновить три функции навигации (строки 44-50):
   - `handleBackClick`: `navigate(getBackPath())` вместо `navigate("/organization")`
   - `handleSaveAndExit`: аналогично
   - `handleExitWithoutSave`: аналогично
