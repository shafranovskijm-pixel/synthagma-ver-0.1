

## План: Исправить пустую вкладку «Конвейер»

### Проблема
`BulkPipelineWidget` содержит ранний `return null` (строка 276): если все курсы уже валидированы (`is_validated = true`) и режим «В работе», виджет полностью скрывается. В отдельной вкладке это выглядит как пустая страница.

### Решение

**Файл: `src/components/admin/BulkPipelineWidget.tsx`**

Заменить `return null` на информативную заглушку с кнопками переключения режима:

```typescript
if (activeCourses.length === 0 && excelImport.parsedCourses.length === 0 && pipelineMode === "progress") {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-8 text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        <p className="text-lg font-medium">Все курсы обработаны</p>
        <p className="text-muted-foreground text-sm">
          Нет курсов в работе. Переключитесь на режим «Готово» или «Все» для просмотра и повторной обработки.
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={() => setPipelineMode("ready")}>
            Готово ({readyCourses.length})
          </Button>
          <Button variant="outline" onClick={() => setPipelineMode("all")}>
            Все ({courses.length + readyCourses.length})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

Одно изменение, один файл — вкладка «Конвейер» больше не будет пустой.

