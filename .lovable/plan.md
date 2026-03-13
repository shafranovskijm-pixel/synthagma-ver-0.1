

## План: Категоризированный каталог в маркетплейсе (как на странице Ростехнадзора)

### Что сделать

Заменить текущую простую группировку (Collapsible с `extractCategory` по « — ») на визуально богатый каталог, аналогичный странице `/rostechnadzor-courses`: карточки категорий с иконками, цветами, бейджами «N курсов» и списком подкурсов внутри.

### Подход

**`src/components/student/StudentCourseStore.tsx`**:

1. **Добавить маппинг категорий на иконки и цвета** — объект `categoryMeta`, аналогичный массиву `categories` из `RostechnadzorCoursesPage.tsx`:
   - «Промышленная безопасность» → Factory, orange
   - «Электробезопасность» → Zap, yellow
   - «Энергетика» → Flame, red
   - «Экологическая безопасность» → Leaf, green
   - «Гидротехнические сооружения» → Droplets, blue
   - «Строительный контроль» → HardHat, accent
   - Fallback → BookOpen, primary

2. **Переработать рендер каталога** (строки 380-401) — вместо простых Collapsible-строк использовать `Card` с:
   - Иконка категории в цветном круге (как на /rostechnadzor-courses)
   - Название категории + бейдж «N курсов»
   - Внутри: сетка карточек курсов (существующий `renderCourseCard`)
   - Collapsible остаётся для раскрытия/скрытия

3. **Импортировать иконки**: Factory, Flame, Droplets, HardHat, Leaf из lucide-react

### Файлы для изменения

| Файл | Что |
|---|---|
| `src/components/student/StudentCourseStore.tsx` | Визуальная категоризация с иконками и стилями |

