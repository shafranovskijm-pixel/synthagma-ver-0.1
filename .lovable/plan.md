

# Восстановление вкладки «Тарифы» в админской панели организации

## Проблема

Вкладка «Тарифы» была удалена из списка табов в `OrganizationDetailsView`, но весь связанный код остался:
- `saveTariffSettings()` — функция сохранения
- `tariffCustomLabel`, `tariffPaidUntil` — state для кастомной метки и даты оплаты
- `customLimits` — state для индивидуальных лимитов (курсы, ученики, обученных/мес, ИИ-генерации, хранилище)

Эти данные нигде не отображаются — вкладка-триггер и `TabsContent` отсутствуют.

## Что делаем

**Файл:** `src/components/admin/OrganizationDetailsView.tsx`

1. **Добавить TabsTrigger** «Тарифы» в список вкладок (после «Баланс», перед «Документы»), с иконкой `Crown`

2. **Добавить TabsContent value="tariffs"** с содержимым:
   - Текущий тарифный план (из `subscription_plan`) с бейджем
   - Селектор для смены плана (free / start / standard / professional / maximum)
   - Поле «Кастомная метка тарифа» (`tariffCustomLabel`)
   - Поле «Оплачен до» (`tariffPaidUntil`) — date picker
   - Секция «Индивидуальные лимиты» с полями из `customLimits`:
     - Макс. курсов
     - Макс. учеников
     - Обученных в месяц
     - ИИ-генераций
     - Хранилище (ГБ)
   - Каждое поле с чекбоксом «Безлимит» (значение -1)
   - Кнопка «Сохранить тарифные настройки» → вызов `saveTariffSettings()`

## Затрагиваемые файлы
- `src/components/admin/OrganizationDetailsView.tsx` — добавить TabsTrigger + TabsContent для тарифов

