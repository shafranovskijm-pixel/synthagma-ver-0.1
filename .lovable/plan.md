

## Проблема

Сейчас для заказов от студентов в колонке «Покупатель» отображается просто **«Студент»**, без имени. Хотя в таблице `marketplace_orders` есть поле `buyer_user_id`, запрос не подтягивает профиль покупателя.

## Решение

Добавить join к таблице `profiles` через `buyer_user_id`, чтобы получить ФИО студента.

### Изменения

**1. `src/hooks/useAdminMarketplace.ts`** — расширить select-запрос:
```
.select("*, marketplace_course:..., buyer_organization:..., buyer_profile:profiles!marketplace_orders_buyer_user_id_fkey(full_name, email)")
```

**2. `src/components/admin/AdminMarketplaceManager.tsx`** — в колонке «Покупатель» вместо `"Студент"` показывать:
```
buyer_profile?.full_name || buyer_profile?.email || "Студент"
```

**3. `src/types/marketplace.ts`** — добавить `buyer_profile` в тип `MarketplaceOrderWithDetails`.

Два файла, ~5 строк изменений. Имена появятся сразу для всех существующих заказов.

