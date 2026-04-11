

## Исправить ошибку вставки + добавить бонусные дни SkillSpace

### Проблема
Ошибка `Could not find the 'maxNewStudentsPerMonth' column` — при сохранении договора `...form` передаёт в базу поля `maxStudents`, `maxNewStudentsPerMonth`, `storageLimit`, которых нет в таблице `sales_contracts`. Эти поля нужны только для генерации HTML.

### Что будет сделано

**1. Исправить сохранение в БД** (`SalesContracts.tsx`)
- При вставке в `supabase.from('sales_contracts').insert(...)` явно перечислить только поля, которые есть в таблице (исключить `maxStudents`, `maxNewStudentsPerMonth`, `storageLimit`). Вместо `...form` — деструктуризация с исключением лишних полей.

**2. Добавить поле «Бонусные дни SkillSpace»** 
- В форму добавить поле `skillspace_bonus_days` (число) — оставшиеся оплаченные дни на SkillSpace, которые прибавляются к сроку договора.
- В HTML-шаблоне (`contractTemplates.ts`) добавить строку в раздел «Условия»: «Исполнитель предоставляет Заказчику дополнительно {N} календарных дней доступа к Платформе в счёт неиспользованного периода на платформе SkillSpace».
- Расширить интерфейс `ContractData` полем `skillspaceBonusDays`.

### Файлы

| Файл | Действие |
|------|----------|
| `src/components/admin/sales/SalesContracts.tsx` | Исправить insert (убрать лишние поля), добавить поле бонусных дней |
| `src/constants/contractTemplates.ts` | Добавить `skillspaceBonusDays` в интерфейс и в HTML-шаблон |

