## Что делаем

1. **Полностью убираем Checko API из кабинета продаж** — компонент «База компаний (Checko API)» падает с ошибкой, плюс пользователь просит вычистить из кода.
2. **Объединяем «Контакты» и «Компании»** в один раздел «Компании» — там же отображаем плашку «Необработанные загруженные базы» (которая раньше была в «Контактах»).

## Удаляем (Checko)

Файлы — `rm`:
- `src/components/admin/sales/CompaniesDatabase.tsx`
- `src/components/admin/sales/CheckoSearchDialog.tsx`
- `src/components/admin/sales/CheckoSearchHistory.tsx`
- `src/components/admin/sales/CheckoQuotaBar.tsx`
- `src/components/admin/sales/AddInnsDialog.tsx`
- `src/hooks/useCheckoApi.ts`
- `src/hooks/useCheckoSearch.ts`
- `src/data/checkoLicenseTypes.ts`

Edge‑функции — удаляем через supabase deploy delete:
- `checko-search`, `checko-stats`, `checko-enrich-batch`, `checko-daily-enrich`

Текстовые упоминания:
- `src/pages/FeatureSalesCRM.tsx` (строка 217): убрать «(Checko)» из описания шага.
- `src/data/russianRegions.ts`: оставляю — это просто справочник регионов РФ (комментарий «для Checko Search API» поправлю, файл нужен в других местах).

Таблицы `checko_*` в БД оставляю — миграции не трогаю, чтобы не сломать историю; код к ним больше не обращается.

## Объединение «Контакты» + «Компании»

`src/components/admin/sales/CompaniesUnified.tsx`:
- Удаляю вкладку `cold` и весь импорт `CompaniesDatabase` (вместе с `hideColdBase` параметром).
- Сверху над `<Tabs>` добавляю карточку «Необработанные базы» (логика из `ContactsHub` — группировка `sales_leads` по `source` с подсчётом необработанных).
- Остаются вкладки: **В работе** (LeadsManager) · **Архив** · **Чёрный список**.

`src/components/admin/sales/ContactsHub.tsx` — удаляю.

`src/components/admin/sales/SalesSidebar.tsx`:
- Убираю пункт `contacts` из `railGroups`.
- В мобильном меню тоже исчезает (использует те же `salesMenuGroups`).

`src/components/admin/SalesManager.tsx`:
- Default `activeTab` → `'companies'` (вместо `'contacts'`).
- Удаляю строку `contacts: <ContactsHub />` из карты TABS и импорт `ContactsHub`.

`src/pages/SalesDashboard.tsx`:
- `activeLabel="Компании"` (вместо «Контакты»).

## Проверка
- Сайдбар: 8 значков (Обзор · Задачи · Сделки 360° · Компании · КП · Договоры · Подписание · Рассылки).
- При входе в `/sales` сразу открывается раздел «Компании» с плашкой загруженных баз и таблицей лидов.
- Никаких упоминаний Checko в кабинете продаж и в коде кабинета.
