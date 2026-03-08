

## Декор для секций + перенос мобильного приложения вниз

### Что делаем

1. **Перенос секции «Мобильное приложение»** — выделяем из `Features.tsx` в отдельный компонент `MobileApp.tsx` и размещаем в `Index.tsx` после `Testimonials` (перед Footer).

2. **Усиление декора** — текущие декоративные элементы (тонкие линии, точки) слишком незаметны. Добавляем более выразительные элементы в секции, которые выглядят пусто:
   - **EditorDemo** — добавить accent-градиентные blur-пятна (как в Hero), плавающие ромбики, угловые рамки
   - **PricingPlans** — добавить gradient blur-пятна, дополнительные circles и diamonds
   - **Features** (сетка «Всё для обучения») — усилить существующий декор: крупнее blur-пятна, добавить горизонтальные accent-линии
   - **RostechnadzorCourses** — добавить corner decorations, circles, diamonds
   - **Testimonials** — добавить blur-пятна, diamonds, усилить угловые рамки
   - **MobileApp** (новый компонент) — полный набор декора как в Hero

### Стиль декора (единый паттерн)
Каждая секция получает комбинацию из:
- 1–2 градиентных blur-пятна (`bg-accent/5 ... blur-3xl`) — создают «свечение»
- Вертикальные/горизонтальные тонкие линии (уже есть, оставляем)
- Угловые рамки (`border-l border-t ... rounded-tl-2xl`)
- Плавающие ромбики (`rotate-45 border border-accent/20`)
- Маленькие кружки (`rounded-full bg-accent/30`)

### Файлы

| Файл | Действие |
|---|---|
| `src/components/landing/MobileApp.tsx` | Создать — мобильная секция, вырезанная из Features |
| `src/components/landing/Features.tsx` | Убрать блок Mobile App Section (строки ~346–473) |
| `src/pages/Index.tsx` | Добавить `<MobileApp />` после `<Testimonials />` |
| `src/components/landing/EditorDemo.tsx` | Добавить blur-пятна и diamonds |
| `src/components/landing/PricingPlans.tsx` | Добавить blur-пятна и diamonds |
| `src/components/landing/RostechnadzorCourses.tsx` | Добавить corner decorations, circles |
| `src/components/landing/Testimonials.tsx` | Добавить blur-пятна, diamonds |

