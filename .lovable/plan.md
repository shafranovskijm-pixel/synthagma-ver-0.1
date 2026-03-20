

## Исправление ошибки React #31 в карточке ученика

### Проблема
В таблице `test_questions` поле `options` хранит массив объектов `{text: "..."}`, а не массив строк. Когда компонент `TestAttemptDetail` пытается отрендерить `{opt}` напрямую (строка 115), React получает объект вместо строки → ошибка #31 "Objects are not valid as a React child".

### Решение
Исправить два файла:

**1. `src/components/organization/student-detail/TestAttemptDetail.tsx`**
- Строка 115: заменить `{opt}` на `{typeof opt === 'object' && opt !== null ? (opt as any).text : opt}`
- Аналогично в строке 99 для `q.question` — добавить защиту на случай если вопрос тоже объект

**2. `src/components/organization/student-detail/ActivityTab.tsx`**
- В строке 116, где формируются `options`, нормализовать: `options: Array.isArray(q.options) ? q.options.map((o: any) => typeof o === 'object' ? o.text : o) : []`

Предпочтительнее нормализовать данные в ActivityTab при загрузке, чтобы TestAttemptDetail получал уже чистые строки.

### Файлы
| Файл | Изменение |
|------|-----------|
| `ActivityTab.tsx` | Нормализация options при загрузке данных |
| `TestAttemptDetail.tsx` | Защитный рендеринг на случай объектов |

