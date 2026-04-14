

# Добавить поиск по ИНН (DaData) в диалог создания акта

## Что сделать

Добавить в диалог «Создать акт» такой же переключатель «Заказчик — другая организация», как уже реализовано в диалоге счёта. При включении — поле ИНН с кнопкой «Найти», поля названия, КПП и ФИО руководителя. Поиск идёт сначала по локальной БД (`organizations`), если не найдено — через edge function `dadata-company`.

## Изменения

### 1. `src/components/organization/tabs/DocumentsTab.tsx`
- Добавить state: `actOtherCustomer`, `actCustomerName`, `actCustomerInn`, `actCustomerKpp`, `actCustomerDirector`, `actCustomerPosition`
- Расширить `handleSearchByInn` или создать `handleActSearchByInn` — сначала ищет в `organizations`, если не найдено — вызывает `supabase.functions.invoke("dadata-company", { body: { inn } })` для получения реквизитов через DaData
- В диалоге акта (строки 780–830) добавить чекбокс и блок полей (аналогично invoice dialog)
- В `handleGenerateAct` — если `actOtherCustomer`, передавать кастомные данные вместо `orgDetails`

### 2. `src/utils/generateAct.ts`
Никаких изменений не нужно — он уже принимает `orgName`, `orgInn`, `directorName`, `directorPosition` как параметры.

## Технические детали

Поиск по ИНН через DaData:
```typescript
const { data: dadataResult } = await supabase.functions.invoke("dadata-company", {
  body: { inn }
});
if (dadataResult?.success) {
  setActCustomerName(dadataResult.company.shortName);
  setActCustomerInn(dadataResult.company.inn);
  setActCustomerKpp(dadataResult.company.kpp || "");
  setActCustomerDirector(dadataResult.company.management || "");
  setActCustomerPosition(dadataResult.company.managementPosition || "Руководитель");
}
```

Изменения только в одном файле (`DocumentsTab.tsx`), миграции не нужны.
