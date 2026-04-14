

# Исправление визуальных артефактов (полосы помехи) в боковых меню

## Причина
CSS-свойство `backdrop-blur` пересчитывает размытие всех пикселей под элементом на каждом кадре. При любом движении контента под ним (скролл, анимации) возникают видимые полосы-артефакты — это известная проблема рендеринга в браузерах.

## Решение
Убрать `backdrop-blur-sm` из всех трёх сайдбаров. Фон уже задан через `backgroundColor` — размытие не нужно.

## Файлы (3 файла, по 2-3 строки в каждом)

1. **`src/components/organization/OrgSidebar.tsx`**
   - Строка 208: убрать `backdrop-blur-sm` из навигационной «пилюли»
   - Строка 249: убрать `backdrop-blur-sm` из `TooltipContent`

2. **`src/components/organization/OrgSettingsSidebar.tsx`**
   - Строка 37: убрать `backdrop-blur-sm` из `aside`
   - Строка 69: убрать `backdrop-blur-sm` из навигационной «пилюли»
   - Строка 100: убрать `backdrop-blur-sm` из `TooltipContent`

3. **`src/components/student/StudentSidebar.tsx`**
   - Строка 101: убрать `backdrop-blur-sm` из навигационной «пилюли»

