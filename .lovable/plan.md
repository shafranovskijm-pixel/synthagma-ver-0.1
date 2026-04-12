

# Уведомление об окончании тарифа + Генерация счёта на оплату

## Что делаем

1. **Автоматическое уведомление** — когда до окончания тарифа остаётся 7 дней, организация получает уведомление в колокольчик с предложением оплатить и ссылкой на счёт.

2. **Страница счёта на оплату** — генерируется HTML-документ (по аналогии с договорами в `SalesContracts`) с реквизитами ИП Шафрановского, подписью и печатью. Счёт можно скачать в PDF.

3. **Таблица счетов** — хранение сгенерированных счетов в БД для истории.

## Реквизиты исполнителя (зашиты в шаблон)

- **ИП Шафрановский Максим Михайлович**, ИНН 253615392404, ОГРНИП 324253600042754
- Счёт: 40914810200040551529
- Банк: ООО «Озон Банк», БИК 044525068
- Корр. счёт: 30101810645374525068
- ИНН банка: 9703077050, КПП банка: 770301001

## Технические детали

### Шаг 1: Миграция — таблица `subscription_invoices`

```sql
CREATE TABLE public.subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  plan TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  period_months INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
-- RLS: организация видит свои счета
CREATE POLICY "Org can view own invoices" ON public.subscription_invoices
  FOR SELECT TO authenticated
  USING (organization_id = current_organization_id());
```

### Шаг 2: Edge Function `check-subscription-expiry`

Cron-задача (ежедневно), которая:
1. Ищет организации с `paid_until` через 7 дней (±1 день)
2. Проверяет, что уведомление ещё не отправлялось (нет записи в `org_notifications` с `type = 'subscription_expiry'` за последние 7 дней)
3. Генерирует счёт в `subscription_invoices`
4. Создаёт уведомление в `org_notifications` с `type = 'subscription_expiry'`, `related_id = invoice.id`

### Шаг 3: Шаблон счёта — `src/constants/invoiceTemplate.ts`

HTML-шаблон счёта (аналогично `contractTemplates.ts`):
- Шапка с реквизитами исполнителя (ИП Шафрановский)
- Банковские реквизиты получателя
- Таблица: наименование услуги (тарифный план), период, сумма
- Подпись и печать (из `contractAssets.ts` — те же `CONTRACT_SIGNATURE_B64` и `CONTRACT_STAMP_B64`)
- Итого с НДС (ИП на УСН — «НДС не облагается»)

### Шаг 4: Страница просмотра счёта — `src/pages/InvoiceView.tsx`

Маршрут: `/invoice/:id`
- Загружает данные счёта из `subscription_invoices` + данные организации
- Рендерит HTML-шаблон с реквизитами обеих сторон
- Кнопка «Скачать PDF» (через window.print())

### Шаг 5: Обновить `OrgNotifications.tsx`

- При клике на уведомление с `type = 'subscription_expiry'` и `related_id` — навигация на `/invoice/{related_id}`
- Добавить тип `subscription_expiry` в `PAYMENT_TYPES`

### Шаг 6: Добавить кнопку «Выставить счёт» в `SubscriptionTab.tsx`

- Когда тариф платный и `daysRemaining <= 30` — показать кнопку «Выставить счёт на продление»
- При нажатии — создаёт запись в `subscription_invoices` и открывает страницу счёта

## Затрагиваемые файлы

- **Миграция SQL** — таблица `subscription_invoices` + RLS
- **Новый**: `supabase/functions/check-subscription-expiry/index.ts` — cron edge function
- **Новый**: `src/constants/invoiceTemplate.ts` — HTML-шаблон счёта
- **Новый**: `src/pages/InvoiceView.tsx` — страница просмотра/скачивания
- **Изменение**: `src/components/organization/OrgNotifications.tsx` — навигация по клику
- **Изменение**: `src/components/organization/SubscriptionTab.tsx` — кнопка «Выставить счёт»
- **Изменение**: маршруты в App.tsx — добавить `/invoice/:id`

