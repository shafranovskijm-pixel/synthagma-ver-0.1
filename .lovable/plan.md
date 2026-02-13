

# Исправление лимитов бесплатного тарифа

## Проблемы

1. **Лимит учеников не проверяется** — кнопки «Добавить ученика» и «Импорт учеников» не проверяют `checkLimit('student')`, позволяя бесплатным аккаунтам добавлять неограниченное число учеников.
2. **Настройки курсов не заблокированы** — кнопки переключения видеоидентификации, последовательности уроков и перемотки видео в `CoursesTab` видны и работают даже на бесплатном тарифе, хотя `courseSettings: false`.

## Что будет исправлено

### 1. Проверка лимита учеников при добавлении

**Файл:** `src/pages/OrganizationDashboard.tsx`

- Подключить `useSubscriptionLimits` (уже есть в дочерних компонентах, добавим в дашборд)
- Перед открытием диалога «Добавить ученика» и «Импорт учеников» вызывать `checkLimit('student')` 
- Если лимит превышен — показывать `toast.error` с сообщением о тарифе и блокировать действие

### 2. Проверка лимита внутри `useStudentManagement.createStudent()`

**Файл:** `src/hooks/useStudentManagement.ts`

- Добавить параметр `checkStudentLimit` (функция) в пропсы хука
- В начале `createStudent()` вызывать проверку и прерывать создание при превышении лимита
- Это защитит от обхода через прямой вызов функции

### 3. Блокировка настроек курсов на бесплатном тарифе

**Файл:** `src/components/organization/tabs/CoursesTab.tsx`

- Расширить деструктуризацию `useSubscriptionLimits` — получить `hasCourseSettings`
- В функции `handleToggleCourseSetting`: если `!hasCourseSettings`, показывать toast с предупреждением и прерывать действие
- Визуально: кнопки настроек (видеоидентификация, последовательность, перемотка) отображать как `disabled` с пониженной прозрачностью, когда `!hasCourseSettings`

## Технические детали

### `src/pages/OrganizationDashboard.tsx`

```
// Добавить:
const { checkLimit } = useSubscriptionLimits(organizationId);

// Кнопка «Добавить ученика»:
onClick={() => {
  const result = checkLimit('student');
  if (!result.allowed) {
    toast.error(result.message);
    return;
  }
  studentManagement.setShowAddStudentDialog(true);
}}

// Кнопка «Импорт учеников» — аналогично
```

### `src/hooks/useStudentManagement.ts`

```
// В createStudent(), в начале:
if (checkStudentLimit) {
  const result = checkStudentLimit();
  if (!result.allowed) {
    toast.error(result.message);
    return false;
  }
}
```

### `src/components/organization/tabs/CoursesTab.tsx`

```
// Расширить деструктуризацию:
const { checkLimit, hasCourseSettings } = useSubscriptionLimits(organizationId);

// В handleToggleCourseSetting:
if (!hasCourseSettings) {
  toast.error('Настройки курсов доступны начиная с тарифа Старт');
  return;
}

// В JSX: добавить disabled и opacity к кнопкам настроек
disabled={!hasCourseSettings}
className={`... ${!hasCourseSettings ? 'opacity-40 cursor-not-allowed' : ''}`}
```

### Затронутые файлы

| Файл | Изменение |
|---|---|
| `src/pages/OrganizationDashboard.tsx` | Проверка `checkLimit('student')` перед добавлением/импортом |
| `src/hooks/useStudentManagement.ts` | Дополнительная проверка лимита в `createStudent()` |
| `src/components/organization/tabs/CoursesTab.tsx` | Блокировка настроек курсов при `!hasCourseSettings` |

