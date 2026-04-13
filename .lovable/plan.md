

# Переделать табы курса в sidebar-навигацию как у Документов

## Суть
Заменить горизонтальные табы (Ученики, Материалы, История и т.д.) на вертикальный sidebar с группировкой, цветными иконками, циановой подсветкой при hover и разделителями — по аналогии с `DocumentsTab`.

## Что будет сделано

### 1. Заменить `<Tabs>` + `<TabsList>` на layout sidebar + content panel
Текущая структура (горизонтальные табы):
```
<Tabs> → <TabsList> → <TabsTrigger>...
```
Новая структура (как в DocumentsTab):
```
<div className="flex flex-col lg:flex-row">
  <nav> — вертикальный sidebar с кнопками </nav>
  <div> — правая панель с контентом </div>
</div>
```

### 2. Группировка пунктов навигации
- **Обучение**: Ученики, Материалы, История, Тесты, Группы
- **Настройки**: Страница курса, Настройки, Напоминания

Между группами — разделитель с подписью (как «ДОКУМЕНТООБОРОТ» / «ИНСТРУМЕНТЫ» в DocumentsTab).

### 3. Цветные иконки для каждого пункта
- Ученики — `text-primary`
- Материалы — `text-amber-500`
- История — `text-violet-500`
- Тесты — `text-emerald-500`
- Группы — `text-blue-500`
- Страница курса — `text-rose-500`
- Настройки — `text-muted-foreground`
- Напоминания — `text-orange-500`

### 4. Hover-анимации и циановая подсветка
- Активный пункт: `bg-primary/15 text-primary border-r-2 border-primary`
- Hover: `hover:text-primary hover:bg-primary/10 hover:translate-x-0.5 transition-all duration-200`
- Мобильная версия: горизонтальный скролл (как в DocumentsTab)

### 5. Градиентный фон sidebar
`bg-gradient-to-b from-card to-muted/20` — как в DocumentsTab.

## Файлы

| Файл | Изменение |
|---|---|
| `src/components/organization/CourseDetailsContent.tsx` | Заменить Tabs/TabsList на sidebar-навигацию с группировкой, цветными иконками, hover-анимацией. Убрать `TabsContent`, использовать условный рендеринг по `activeTab`. |

Миграций не требуется.

