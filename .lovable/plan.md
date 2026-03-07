

# Исправление навигации в магазин курсов

## Проблема
Кнопка «Перейти в магазин» из пустого состояния вкладки курсов переключает таб на `"store"`, но магазин зарегистрирован под именем `"services"`. В результате ни один `TabContentRenderer` блок не рендерится — пустая страница.

## Решение

### Файл: `src/components/organization/tabs/CoursesTab.tsx` (строка ~115)

Заменить:
```typescript
onClick={() => dashboard?.tabNavigation.setActiveTab("store" as any)}
```
На:
```typescript
onClick={() => dashboard?.tabNavigation.setActiveTab("services" as any)}
```

Одна строка — одно изменение. Кнопка «Перейти в магазин» будет корректно открывать вкладку магазина курсов.

