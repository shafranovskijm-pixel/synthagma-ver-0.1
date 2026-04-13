

# Добавить кнопку «Войти как ученик» на страницу ученика

## Суть
На странице `/organization/student/:studentId` добавить кнопку «Войти как ученик» (аналогично кнопке «Войти в организацию» у админа). При клике — сохраняем данные в `localStorage` под ключом `adminViewAsStudent` и перенаправляем на `/student`.

## Что будет сделано

### Изменить `src/pages/OrganizationStudentDetails.tsx`
- В шапке (header), рядом с кнопкой «Назад» или в правой части sub-header, добавить кнопку **«Войти как ученик»** с иконкой `LogIn` или `ExternalLink`
- Стилизация: outline/ghost с cyan hover (`hover:text-primary hover:bg-primary/10`), аналогично кнопке «Войти в организацию» у админа
- При клике:
  ```typescript
  localStorage.setItem('adminViewAsStudent', JSON.stringify({
    userId: student.user_id,
    name: student.name,
    orgReturn: '/organization'
  }));
  navigate('/student');
  ```
- Это использует уже существующий механизм «режима просмотра» в `StudentDashboard`, который проверяет `adminViewAsStudent` в localStorage и показывает баннер с кнопкой «Выйти»

### Опционально: обновить выход из режима просмотра
- В `StudentDashboard.tsx` при выходе из режима просмотра — если есть `orgReturn` в данных localStorage, перенаправлять на `/organization` вместо `/admin`

## Файлы

| Файл | Изменение |
|---|---|
| `src/pages/OrganizationStudentDetails.tsx` | Добавить кнопку «Войти как ученик» в header |
| `src/pages/StudentDashboard.tsx` | Обновить редирект выхода из режима просмотра (orgReturn) |

Миграций не требуется.

