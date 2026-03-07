

## Добавить кнопку «Предпросмотр кабинета ученика» на вкладку «Ученики»

Добавить кнопку рядом с заголовком «Все ученики» (строка ~266-281 в `StudentsTab.tsx`), которая откроет кабинет ученика в режиме предпросмотра. Механизм уже реализован — `localStorage.setItem('previewStudentDashboard', 'true')` + `window.open('/student', '_blank')`.

### Изменения

**`src/components/organization/tabs/StudentsTab.tsx`**

- Импортировать `Eye` из `lucide-react`
- В блоке `<div className="flex items-center justify-between">` (строка ~265), после `</div>` с заголовком (строка ~281), добавить кнопку:

```tsx
<Button
  variant="outline"
  size="sm"
  className="rounded-xl gap-2"
  onClick={() => {
    localStorage.setItem('previewStudentDashboard', 'true');
    window.open('/student', '_blank');
  }}
>
  <Eye className="w-4 h-4" />
  <span className="hidden sm:inline">Предпросмотр кабинета</span>
</Button>
```

Кнопка будет в правой части заголовка, на мобильных — только иконка.

