

# Быстрый переход «Партнёры» внутри кабинета организации

## Проблема

Кнопка «Партнёрам» (Handshake) в хедере организации ведёт на `/partner` — отдельную лендинг-страницу с полной перезагрузкой. У админа аналогичный пункт «Партнёры» просто переключает таб на месте (`setActiveTab("referrals")`), что мгновенно.

## Решение

В `OrganizationProfile.tsx` уже есть вкладка `"partner"` с компонентом `PartnerCabinet`. Нужно лишь изменить навигацию кнопки, чтобы она вела на `/organization/profile?tab=partner` — тот же быстрый переход, как у «Профиль», «Настройки» и т.д.

## Изменения

### `src/components/organization/OrgDashboardHeader.tsx`
- Заменить `navigate("/partner")` на `navigate("/organization/profile?tab=partner")`

### `src/pages/OrganizationProfile.tsx`
- При монтировании читать `?tab=partner` из URL и устанавливать начальную вкладку `"partner"` вместо дефолтной `"profile"`

Всего 2 файла, минимальные правки — ~5 строк.
