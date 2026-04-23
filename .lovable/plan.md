

# План: продающие страницы для «Рассылок» и «CRM/Продаж» + интеграция в тарифы

## Что добавляем

Два новых модуля в продуктовую линейку Синтагмы получают **отдельные продающие лендинги** в стиле существующих `FeatureAICourses` / `FeatureBranding` и попадают в **сравнительную таблицу тарифов** на главной.

### Модуль 1. Email-рассылки (`/feature/email-campaigns`)
Уже реализовано в проекте: SMTP, 7 шаблонов (welcome/cold/proposal/reactivation и др.), планировщик, A/B-тест тем, click-tracking + UTM, suppression-лист, RFC 8058 unsubscribe, drip-цепочки, импорт CSV/Excel, inbox-превью Gmail/Mail.ru/Outlook, проверка SPF/DKIM/DMARC.

### Модуль 2. CRM и Продажи (`/feature/sales-crm`)
Уже реализовано: канбан сделок с drag-n-drop, лиды, КП с PDF-экспортом и публичными ссылками, договоры (ИП Шафрановский), подписания (ПЭП), счета и автонапоминания об оплате, тайм-лайн «Сделки 360°», план месяца + лидерборд менеджеров, демо-доступы, акт сверки, импорт лидов, задачи.

## Структура каждой продающей страницы

Единый каркас (как в `FeatureAICourses.tsx`) — header c логотипом и кнопкой «Назад», затем секции:

1. **Hero** — крупный заголовок, подзаголовок-обещание, 2 CTA («Попробовать бесплатно» → `/register`, «Сравнить тарифы» → `/#pricing`), badge «Включено в тариф …».
2. **Боли клиента** (3 карточки) — что было до Синтагмы.
3. **Решение** — сетка 6 карточек ключевых возможностей с иконками `lucide-react`.
4. **Как это работает** — 4 шага с нумерацией.
5. **Скриншот/демо-блок** — мокап интерфейса (статичный SVG-мок в стиле существующих демо).
6. **Доступность по тарифам** — мини-таблица «✓ / —» по 5 планам со ссылкой на полный прайс.
7. **FAQ** — 5–6 вопросов в Accordion.
8. **CTA-блок** + Footer.

Стиль — Teal/Cyan (#1AAB9B), `font-display`, `motion.div` с `fadeUp`, фон `bg-background`.

### Контент «Email-рассылки»
- **Боли:** «менеджеры пишут письма вручную → теряют лидов», «нет видимости открытий/кликов», «клиенты жалуются на спам — нет отписки».
- **6 фич:** Шаблоны и редактор • Планировщик и A/B-тест • Click-tracking + UTM • Drip-цепочки • Импорт CSV/Excel + suppression • Проверка SPF/DKIM/DMARC + inbox-превью.
- **FAQ:** «Свой ли SMTP?», «Как с законом о персональных данных?», «Сколько писем в месяц?», «Что с отпиской?», «Можно ли использовать домен организации?».

### Контент «CRM и Продажи»
- **Боли:** «сделки в Excel — теряются», «КП в Word, история переписки нигде не хранится», «нет контроля менеджеров и плана».
- **6 фич:** Канбан со сделками + DnD • КП с PDF и публичной ссылкой • Договоры + ПЭП-подписание • Счета и автонапоминания об оплате • План месяца + лидерборд • Тайм-лайн «Сделки 360°» по компании.
- **FAQ:** «Подходит ли для не-образовательных компаний?», «Можно импортировать лидов?», «Как с ЭЦП?», «Интеграция с банком?», «Сколько менеджеров?».

## Интеграция в тарифы

### Расширение `SUBSCRIPTION_PLANS`
В `src/constants/subscriptionPlans.ts` добавить два булевых лимита:
- `emailCampaignsEnabled` — `true` начиная с **Старт**.
- `salesCrmEnabled` — `true` начиная с **Стандарт**.

(Free — обе функции выключены, чтобы стимулировать апгрейд; Профессиональный/Максимум — обе включены.)

### Обновление таблицы `featureRows` в `PricingPlans.tsx`
Добавить две строки между «Журналы» и «Документы для ЛОО»:
```
{ label: "Email-рассылки", link: "/feature/email-campaigns",
  getValue: (p) => SUBSCRIPTION_PLANS[p].limits.emailCampaignsEnabled }
{ label: "CRM и Продажи", link: "/feature/sales-crm",
  getValue: (p) => SUBSCRIPTION_PLANS[p].limits.salesCrmEnabled }
```
Плюс описания в `featureDescriptions` (попап с тултипом).

### Обновление каталога функций (`featuresData.ts` + БД)
Добавить две новые категории `email_campaigns` и `sales_crm` в `getDefaultFeatures()` с базовыми ценами и подфункциями (для страницы `/features` и PDF-калькулятора). Иконки: `Mail`, `TrendingUp`. Цвета: `#3B82F6`, `#F97316`.

### Маршруты
В `src/routes/publicRoutes.tsx` добавить:
```
const FeatureEmailCampaigns = lazyWithRetry(() => import("@/pages/FeatureEmailCampaigns"));
const FeatureSalesCRM = lazyWithRetry(() => import("@/pages/FeatureSalesCRM"));
// + <Route path="/feature/email-campaigns" />
// + <Route path="/feature/sales-crm" />
```

### Карточки на главной
В `src/components/landing/Features.tsx` добавить две новые карточки в общую сетку с ссылками на новые страницы.

## Технические детали

- **Файлы (новые):** `src/pages/FeatureEmailCampaigns.tsx`, `src/pages/FeatureSalesCRM.tsx`.
- **Файлы (правка):** `src/constants/subscriptionPlans.ts`, `src/components/landing/PricingPlans.tsx`, `src/components/landing/Features.tsx`, `src/pages/featuresData.ts`, `src/routes/publicRoutes.tsx`.
- **SEO:** `<Helmet>` с уникальным title/description/OG-image для обеих страниц + canonical `https://sintagma.com.ru/feature/...`.
- **БД:** опционально — INSERT в `system_feature_categories` и `system_features` через миграцию, чтобы новые категории отображались в админ-панели «Возможности».
- **Стиль:** строго Teal/Cyan, без backdrop-blur на сайдбарах (правило из памяти проекта).

## Что НЕ делаем

- Не меняем цены тарифов.
- Не трогаем существующую логику CRM и Email-рассылок — только продающие лендинги и отображение в прайсе.
- Не добавляем платные одиночные дополнения (отдельная покупка модуля без тарифа) — это потребует логики биллинга.

