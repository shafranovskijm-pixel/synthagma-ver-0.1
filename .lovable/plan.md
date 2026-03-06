

## Кнопка «Проверить все» на папке «Курсы Ростехнадзора»

### Что делаем
Добавляем кнопку «Проверить все» в заголовок аккордеона группы со статусом `ready`. При клике — последовательно валидируем все курсы в папке (та же логика что в `handleValidateCourse`), показываем прогресс, и в конце выводим сводку.

### Изменения в `src/components/admin/AdminMarketplaceManager.tsx`

1. **Новые state**:
   - `bulkValidatingGroup: string | null` — категория, которая сейчас проверяется
   - `bulkValidateProgress: string` — текст прогресса ("3/13...")

2. **Новая функция `handleBulkValidate(group)`**:
   - Итерирует по всем курсам группы
   - Для каждого вызывает ту же логику валидации (запрос уроков, вопросов, проверка критериев)
   - Обновляет `validatedCourses` и `is_validated` в БД
   - Считает: ok/error/total
   - В конце показывает toast со сводкой: "Проверено 13: ✅ 10 готово, ❌ 3 с ошибками"
   - Вызывает `h.fetchData()` для обновления группировки

3. **UI**: Рядом с бейджем «Готово» добавить кнопку:
   ```tsx
   <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); handleBulkValidate(group); }}>
     {bulkValidatingGroup === group.category 
       ? <><Loader2 className="w-3 h-3 animate-spin mr-1"/>{bulkValidateProgress}</>
       : <><CheckCircle2 className="w-3 h-3 mr-1"/>Проверить все</>}
   </Button>
   ```

### Файлы
- `src/components/admin/AdminMarketplaceManager.tsx` — единственный файл

