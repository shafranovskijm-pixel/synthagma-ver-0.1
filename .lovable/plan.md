

## Что добавляем

В разделе «Настройки → ЛК ученика» (`SettingsStudentDashboardTab.tsx`) — новый блок «Визуальная тема ученика»:
- селектор тем (тот же `ThemeSelector`, что у админа/студента),
- сохранение `studentTheme: string | null` в `organizations.student_dashboard_settings`,
- подсказка: «Это тема по умолчанию. Ученик сможет изменить её в своём профиле».

В кабинете ученика (`useStudentDashboard.ts` + `StudentDashboard.tsx`):
- читаем `studentTheme` из `student_dashboard_settings`,
- если у ученика **ещё нет** своего выбора (`localStorage.visual-theme` пуст) — применяем тему организации (без записи в localStorage, чтобы при сбросе организацией всё подхватилось снова),
- если ученик потом сам выберет тему через `ThemeSelector` в профиле — она запишется в localStorage и победит организационную (приоритет: личный выбор > org > пусто).

## Файлы

1. **`src/components/organization/SettingsStudentDashboardTab.tsx`**
   - Добавить state `studentTheme: string | null`, читать/сохранять в `student_dashboard_settings.studentTheme`.
   - Под существующими тогглами добавить секцию «Визуальная тема» с `<ThemeSelector value={studentTheme} onThemeChange={...} />` (нужен мини-доработка — см. п.3).
   - Кнопка «Сохранить» сохраняет всё вместе.

2. **`src/hooks/useStudentDashboard.ts`**
   - Расширить `DashboardSettings` полем `studentTheme: string | null`.
   - При маппинге `effectiveDashboardSettings` читать `studentTheme`.
   - Возвращать его наружу.

3. **`src/components/ui/ThemeSelector.tsx`**
   - Сделать controlled-вариант: принимать необязательные `value?: string | null` и `onChange?: (id: string | null) => void`. Если переданы — не трогать localStorage и не диспатчить глобальный event (org-режим). Если не переданы — текущее поведение (студент/админ для своего ЛК).

4. **`src/pages/StudentDashboard.tsx`** (и `StudentSidebar` / `OrgBanner` / `HeroBannerSwiper` через единый источник правды — localStorage уже работает как сейчас):
   - После загрузки `dashboardSettings` в эффекте: если `localStorage.visual-theme` пуст и `dashboardSettings.studentTheme` задан → вызвать `storeThemeId(studentTheme)` + диспатчить `visual-theme-change`. **Только** при пустом localStorage — это и даёт «организация задаёт по умолчанию, ученик может перевыбрать».
   - Чтобы при смене темы организацией ученик с активным личным выбором ничего не потерял, ничего больше не делаем. А чтобы ученик мог «вернуться к теме организации», добавим в `ThemeSelector` кнопку «Сбросить» (она уже есть) — после неё тема организации применится при следующем заходе. Дополнительно — после `clearTheme` в студенте сразу применим org-тему, если она есть.

## Этапы

1. Доработать `ThemeSelector` (controlled-режим).
2. В `SettingsStudentDashboardTab` добавить блок «Визуальная тема ученика» с сохранением в `student_dashboard_settings.studentTheme`.
3. Расширить `useStudentDashboard.ts`: тип, загрузка, экспорт `studentTheme`.
4. В `StudentDashboard.tsx` применить org-тему при пустом localStorage; в обработчике сброса темы у ученика — вернуться к org-теме.
5. Проверка end-to-end:
   - Организация выбрала тему «Пляж» → новый ученик заходит → у него сразу «Пляж».
   - Ученик в своём профиле выбрал «Океан» → у него «Океан», даже если организация поменяла на «Лаванду».
   - Ученик нажал «Сбросить» в `ThemeSelector` → применилась тема организации.

