

## Интеграция Robokassa для приёма оплат за курсы

### Общая схема

Каждая организация подключает свой магазин Robokassa (MerchantLogin + Password1 + Password2). Слушатель видит цену курса и кнопку «Оплатить». После оплаты деньги поступают напрямую на счёт организации в Robokassa.

```text
Слушатель → Кнопка «Оплатить» → Edge Function (формирует подпись) → Redirect на Robokassa
Robokassa → ResultURL (Edge Function) → Подтверждает оплату → Создаёт enrollment
Организация → Вкладка «Финансы» → Видит список оплат
```

### Что будет сделано

**1. Настройки Robokassa для организации**
- В настройках организации (вкладка «Настройки») — новый блок: MerchantLogin, Password1 (для формирования подписи), Password2 (для проверки ResultURL), тестовый режим (вкл/выкл).
- Хранение в новой таблице `organization_payment_settings` (пароли шифруются через `encrypt_password`).

**2. Цена на курсах организации**
- Новое поле `price` (numeric, default 0) в таблице `courses`.
- В редакторе курса — поле «Стоимость (₽)». Если 0 или пусто — курс бесплатный.

**3. Таблица оплат `course_payments`**
```sql
id uuid PK
organization_id uuid FK
course_id uuid FK
user_id uuid FK (nullable, если до регистрации)
amount numeric NOT NULL
status text ('pending','paid','failed','refunded')
robokassa_inv_id bigint UNIQUE
payment_method text
paid_at timestamptz
email text
created_at timestamptz
```

**4. Edge Function `robokassa-init` — инициализация оплаты**
- Принимает: course_id, user_id (опционально), email.
- Читает настройки организации (MerchantLogin, Password1, тест).
- Создаёт запись в `course_payments` со статусом `pending`.
- Формирует SignatureValue = MD5(MerchantLogin:OutSum:InvId:Password1).
- Возвращает URL для редиректа на `https://auth.robokassa.ru/Merchant/Index.aspx`.

**5. Edge Function `robokassa-result` — webhook от Robokassa (ResultURL)**
- Публичный endpoint (без JWT).
- Проверяет подпись: MD5(OutSum:InvId:Password2).
- Обновляет `course_payments.status = 'paid'`.
- Автоматически создаёт enrollment (зачисление на курс).
- Отвечает `OK{InvId}` (требование Robokassa).

**6. Кнопка оплаты для слушателя**
- На странице курса / в каталоге — кнопка «Оплатить {price} ₽».
- При клике вызывает `robokassa-init`, получает URL и делает `window.location.href = url`.
- Если курс бесплатный — кнопка «Записаться» как сейчас.

**7. Вкладка «Финансы» для организации**
- Новый таб в `OrgSidebar` — «Финансы» (иконка CreditCard).
- Список оплат: дата, слушатель, курс, сумма, статус.
- Итого за период (фильтр по месяцам).
- Деньги поступают напрямую в Robokassa организации — «вывод» не нужен, т.к. это их собственный аккаунт.

### Таблицы (миграция)

| Таблица | Действие |
|---------|----------|
| `organization_payment_settings` | Создать (merchant_login, password1_encrypted, password2_encrypted, is_test_mode, org FK) |
| `courses` | Добавить колонку `price numeric default 0` |
| `course_payments` | Создать (см. выше) |

### Файлы

| Файл | Действие |
|------|----------|
| `supabase/functions/robokassa-init/index.ts` | Создать — формирование URL оплаты |
| `supabase/functions/robokassa-result/index.ts` | Создать — webhook обработка |
| `src/components/organization/PaymentsTab.tsx` | Создать — вкладка «Финансы» |
| `src/components/organization/OrgSidebar.tsx` | Добавить таб «Финансы» |
| `src/components/organization/tabs/TabContentRenderer.tsx` | Добавить рендеринг PaymentsTab |
| `src/components/organization/SettingsTab.tsx` | Добавить блок настроек Robokassa |
| Компоненты курса/студента | Добавить кнопку «Оплатить» |

### Безопасность
- Пароли Robokassa шифруются в БД (как пароли организаций).
- ResultURL проверяет подпись Robokassa перед обновлением статуса.
- RLS: организация видит только свои платежи.
- Edge function `robokassa-result` — публичная (webhook), но с проверкой подписи.

