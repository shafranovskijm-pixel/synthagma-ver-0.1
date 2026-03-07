

## Спрятать секции реквизитов в аккордеоны

Обернуть каждую секцию формы реквизитов (`OrgRequisitesForm.tsx`) в `Accordion` — «Основные реквизиты», «Адреса», «Руководитель», «Банковские реквизиты». Блок «Автозаполнение по ИНН» и кнопка «Сохранить» остаются вне аккордеонов.

### Изменения

**`src/components/organization/OrgRequisitesForm.tsx`**

- Импортировать `Accordion, AccordionContent, AccordionItem, AccordionTrigger`
- Заменить 4 секции (`bg-card border`) на `<Accordion type="multiple" defaultValue={[]}>`  с 4 `AccordionItem`:
  - `"main"` — Основные реквизиты (Building2)
  - `"address"` — Адреса (MapPin)
  - `"director"` — Руководитель (User)
  - `"bank"` — Банковские реквизиты (Landmark)
- Триггер каждого — текущий заголовок с иконкой
- Контент — текущие поля формы
- Все свёрнуты по умолчанию (`defaultValue={[]}`)

