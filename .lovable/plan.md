

## Исправить предпросмотр кабинета студента для администраторов

### Проблема
Кнопка «Посмотрите, как выглядит кабинет ученика» открывает `/student` в новой вкладке, но на странице StudentDashboard есть защитный редирект (строка 48):

```typescript
if (userRole && userRole !== 'student' && !isAdminView) {
  if (userRole === 'organization') return <Navigate to="/organization" replace />;
  if (userRole === 'admin') return <Navigate to="/admin" replace />;
}
```

Этот редирект проверяет только `isAdminView` (режим «Войти как»), но **не проверяет `isPreviewMode`**. Более того, `isPreviewMode` устанавливается в `useEffect` (асинхронно), а редирект выполняется синхронно при первом рендере — до того, как preview-флаг успевает примениться.

### Решение

**`src/pages/StudentDashboard.tsx`** — добавить `isPreviewMode` в условие редиректа:
```typescript
if (userRole && userRole !== 'student' && !isAdminView && !isPreviewMode) {
```

**`src/hooks/useStudentDashboard.ts`** — инициализировать `isPreviewMode` синхронно (через `useState` initializer) вместо `useEffect`, чтобы значение было доступно уже при первом рендере:
```typescript
const [isPreviewMode, setIsPreviewMode] = useState(() => {
  const preview = localStorage.getItem('previewStudentDashboard');
  if (preview === 'true') {
    localStorage.removeItem('previewStudentDashboard');
    return true;
  }
  return false;
});
```

Аналогично для `isAdminView` — читать `localStorage` синхронно в initializer, чтобы оба флага были доступны до первого рендера.

### Файлы

| Файл | Изменение |
|------|-----------|
| `src/hooks/useStudentDashboard.ts` | Перенести чтение `previewStudentDashboard` и `adminViewAsStudent` из `useEffect` в инициализаторы `useState` |
| `src/pages/StudentDashboard.tsx` | Добавить `!isPreviewMode` в условие редиректа |

