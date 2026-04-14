

# Полноценная страница «Помощь» + открытие в модалке из админки/организации

## Что делаем

1. **Редизайн HelpCenter.tsx** — переделываем страницу по образцу SkillSpace: красивый hero с декоративными элементами (круги, градиенты), анимации fade-in на секциях, hover-эффекты на карточках категорий (подъём + тень), более крупные иконки в цветных кругах, плавные переходы. Контент остаётся тот же, но визуально — premium-уровень.

2. **Создать `HelpCenterDialog.tsx`** — компонент-обёртка Dialog (большой, `max-w-4xl`, `max-h-[85vh]` со скроллом), который рендерит содержимое HelpCenter внутри модального окна. Используется из админки и организации.

3. **Обновить вызовы** — везде где `window.open("/help", "_blank")` или `navigate("/help")` из админки и организации → вместо этого открывать `HelpCenterDialog`:
   - `AdminDashboardHeader.tsx` — dropdown menu item
   - `OrgSettingsSidebar.tsx` — sidebar button  
   - `OrgPageLayout.tsx` — dropdown menu item
   - `OrganizationStudentDetails.tsx` — dropdown menu item
   - `OrganizationCourseDetails.tsx` — dropdown menu item

## Дизайн-детали (по образцу SkillSpace)

- **Hero**: градиент primary → primary/70, декоративные полупрозрачные круги (абсолютно позиционированные), анимация `animate-fade-in`
- **Категории**: карточки с крупными цветными иконками в кругах, `hover:-translate-y-1 hover:shadow-lg transition-all duration-300`
- **FAQ**: аккордеон с плавной анимацией, мягкие тени
- **Секции**: каждая с `animate-fade-in` и задержкой через `style={{ animationDelay }}`
- **Контакты**: карточки с gradient-бордером при hover

## Изменения

### Файлы
1. **`src/pages/HelpCenter.tsx`** — редизайн с декором и анимациями
2. **`src/components/shared/HelpCenterDialog.tsx`** — новый: Dialog + содержимое HelpCenter (или рендерит HelpCenter внутри)
3. **`src/components/admin/AdminDashboardHeader.tsx`** — `window.open("/help")` → state + HelpCenterDialog
4. **`src/components/organization/OrgSettingsSidebar.tsx`** — `navigate("/help")` → state + HelpCenterDialog
5. **`src/components/organization/OrgPageLayout.tsx`** — аналогично
6. **`src/pages/OrganizationStudentDetails.tsx`** — аналогично
7. **`src/pages/OrganizationCourseDetails.tsx`** — аналогично

Итого: 2 файла создание/редизайн, 5 файлов мелкие правки (добавить state + Dialog).

