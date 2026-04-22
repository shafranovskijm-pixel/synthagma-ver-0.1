

# План: продающие пресеты КП + библиотека продающих писем для организаций

## Что есть сейчас
- **КП** редактируется «голым» диалогом: только название, ИНН, email, контакт, скидка, список услуг + примечание. Никаких визуальных пресетов / картинок курса / преднастроенных текстов.
- **Email-шаблоны** хранятся в `email_templates` (scope `org`/`platform`, 7 категорий). Сейчас на платформе только **7 базовых платформенных** шаблонов и **0 готовых продающих** (приглашение на курс / вебинар / промо новинок и т.п.).
- **Связи КП ↔ курс нет**: у `commercial_proposals` есть только `total_amount`, услуги тащатся из `org_services`, курс никак не подцепить.

Идея: добавить «**пресеты КП**» с готовым шаблоном (структура, маркетинговый блок, картинка курса, заранее заполненные услуги) + расширенная библиотека продающих писем, которую организация выбирает в один клик.

---

## 1. Пресеты коммерческих предложений (новая сущность)

Создаём таблицу `proposal_presets` (платформенные + кастомные организации):

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | |
| `scope` | text | `platform` или `org` |
| `organization_id` | uuid? | для org |
| `name` | text | «Стартовый пакет», «Корпоративное обучение HR», … |
| `category` | text | `course_promo`, `corporate`, `webinar`, `consulting`, `custom` |
| `cover_url` | text? | картинка-обложка пресета (показываем при выборе) |
| `intro_html` | text | продающий блок «о школе / о курсе» сверху КП (поддержка `{{vars}}`) |
| `outro_html` | text | блок «как мы работаем / что входит / гарантии» снизу |
| `default_services` | jsonb | массив `{name, description, price, quantity}` — заполнятся в редактор |
| `default_discount_percent` | numeric | |
| `linked_course_id` | uuid? | если пресет под конкретный курс |
| `is_default` | bool | |
| `deleted_at` | timestamptz | soft-delete |

Хук `useProposalPresets(scope, organizationId)` (по образцу `useEmailTemplates`).

### Сидим 6 платформенных пресетов

1. **Стартовый пакет «Курс под ключ»** — обложка, тексты «3 шага», услуги: запуск курса 30 000 ₽ + методическое сопровождение 15 000 ₽
2. **Корпоративное обучение группы 10–50 чел.** — пакет на группу, скидка 15%
3. **Промо нового курса** (под маркетплейс-новинки) — `linked_course_id` пустой, в `intro_html` плейсхолдер `{{course_name}}`
4. **Приглашение на вебинар + апселл курса** — связка с вебинаром
5. **Консультация HR / Охрана труда** — экспертная упаковка
6. **Годовое сопровождение / абонемент** — рекуррентный сценарий

### Изменения в редакторе КП

В `OrgProposalsManager.tsx` кнопка **«Создать КП»** открывает не пустой диалог, а сначала **карусель пресетов** (карточки с обложкой, заголовком, описанием, ценой «от X ₽»). Пользователь:
1. Выбирает пресет → услуги + скидка + intro/outro подтягиваются автоматически
2. Дополняет реквизиты компании
3. Сохраняет

Есть кнопка **«Пустой КП»** для опытных пользователей.

В `commercial_proposals` добавляем 2 поля:
- `preset_id uuid?` — для аналитики «какие пресеты конвертят»
- `intro_html`, `outro_html text` — копия на момент создания (чтобы пресет потом не «отъехал»)

В `ProposalPublic.tsx` (публичная страница КП) над таблицей услуг рендерим `intro_html` с подстановкой переменных, под — `outro_html`. Через `DOMPurify`. Картинки и оформление — внутри HTML.

### Связь с курсом
- В пресете категории `course_promo` поле `linked_course_id` ссылается на `courses.id`
- В `intro_html` доступны переменные `{{course_name}}`, `{{course_duration}}`, `{{course_price}}`, `{{course_url}}` — серверный `process-contract-template` (или новая edge `render-proposal-html`) подставит при отправке
- При создании КП по пресету с курсом — название курса сразу попадает первой услугой

---

## 2. Расширенная библиотека продающих email-шаблонов

Сейчас только 7 базовых. Добавляем **12 готовых платформенных шаблонов** (категории расширим):

### Новые категории
В `TEMPLATE_CATEGORIES` добавить:
- `course_invite` — «Приглашение на курс»
- `webinar_invite` — «Приглашение на вебинар»
- `promo` — «Промо / акции / новинки»
- `nurture` — «Прогрев лида»

### 12 новых шаблонов (seed в `email_templates` scope=`platform`)

| Категория | Название | Subject |
|---|---|---|
| course_invite | Приглашение на курс — короткое | «{{course_name}} — открыли набор» |
| course_invite | Приглашение на курс — экспертное | «{{course_name}}: получите удостоверение за {{course_duration}}» |
| course_invite | Приглашение группы (B2B) | «Обучение для сотрудников {{company_name}} — бесплатный пилот» |
| webinar_invite | Бесплатный вебинар — анонс | «Вебинар «{{webinar_title}}» {{webinar_date}}» |
| webinar_invite | Вебинар — напоминание за день | «Завтра в {{webinar_time}} — не пропустите» |
| webinar_invite | После вебинара — спецоффер | «Спасибо за вебинар. Скидка 20% на {{course_name}} 48 часов» |
| promo | Новинка маркетплейса | «6 новых программ ПК уже доступны» |
| promo | Сезонная акция | «−25% на все программы до конца месяца» |
| promo | Реактивация скидкой | «{{contact_person}}, мы скучаем. Возвращайтесь со скидкой 30%» |
| nurture | Кейс / отзыв | «Как {{example_company}} обучили 47 сотрудников за месяц» |
| nurture | Лид-магнит | «Чек-лист: 12 ошибок при выборе платформы обучения» |
| proposal | Отправка КП — продающее | «{{company_name}}, ваш персональный расчёт внутри» |

Каждое — со стилизованной HTML-вёрсткой (header с логотипом школы `{{org_logo}}`, hero-секция, кнопка-CTA, футер с реквизитами). Превьюшка визуально похожа на письма из CRM.

### Переменные
Расширим список доступных переменных в `email-html-utils` / `process-campaign-html` и в редакторе писем:
- `{{course_name}}`, `{{course_url}}`, `{{course_duration}}`, `{{course_price}}`
- `{{webinar_title}}`, `{{webinar_date}}`, `{{webinar_time}}`, `{{webinar_url}}`
- `{{org_logo}}`, `{{org_name}}`, `{{org_phone}}`, `{{org_site}}`
- (уже есть): `{{contact_person}}`, `{{company_name}}`, `{{unsubscribe_url}}`

В `send-campaign-email/index.ts` добавляем заполнение новых переменных: курс берём из `recipient_filter.course_id` или `campaign.linked_course_id` (новое поле в `email_campaigns`), вебинар — из `recipient_filter.webinar`.

### UI: каталог шаблонов
В `EmailTemplatesManager` (CampaignsManager → вкладка «Шаблоны») сделать **галерею** с фильтром по категории и кнопкой **«Скопировать в свои»** на каждой платформенной карточке. Сейчас платформенные не видны организациям — открыть им read+clone доступ через RLS:

```sql
-- читать платформенные шаблоны может любой авторизованный
create policy "platform email templates readable" on email_templates
  for select using (scope = 'platform' and deleted_at is null);
```

Кнопка «Использовать» делает `INSERT` копии с `scope='org'`, `organization_id=...`, `is_default=false`.

---

## 3. Связка пресет КП ↔ шаблон письма

В `proposal_presets` поле `default_email_template_id uuid?` — при отправке КП по пресету в диалоге `Send` сразу выбран рекомендуемый шаблон письма.

Например: пресет «Промо нового курса» → шаблон «Отправка КП — продающее».

---

## Файлы

### Новые
- `src/hooks/useProposalPresets.ts` — CRUD + клонирование платформенных
- `src/components/organization/sales/ProposalPresetPicker.tsx` — карусель карточек при создании КП
- `src/components/organization/sales/ProposalPresetEditor.tsx` — редактор кастомных пресетов (вкладка «Пресеты КП» в Sales)
- `src/components/admin/sales/PlatformProposalPresetsManager.tsx` — админ-управление платформенными пресетами
- `src/components/sales/EmailTemplateGallery.tsx` — галерея готовых писем с «Использовать» (используется в org и admin)
- `src/assets/proposal-presets/` — 6 обложек (генерация ИИ): `course-turnkey.jpg`, `corporate-group.jpg`, `course-promo.jpg`, `webinar-upsell.jpg`, `expert-consult.jpg`, `annual-subscription.jpg`

### Правки
- `src/components/organization/sales/OrgProposalsManager.tsx` — кнопка «Создать КП» открывает `ProposalPresetPicker`; передача `preset_id`, `intro_html`, `outro_html` в `upsertProposal`
- `src/components/organization/sales/OrgSalesLayout.tsx` — новая вкладка «Пресеты КП» в группе «Документы»
- `src/hooks/useOrgProposals.ts` — поля `preset_id`, `intro_html`, `outro_html` в типах и upsert
- `src/pages/ProposalPublic.tsx` — рендер `intro_html` сверху и `outro_html` снизу через DOMPurify
- `src/hooks/useEmailTemplates.ts` — добавить категории `course_invite`, `webinar_invite`, `promo`, `nurture` в `TEMPLATE_CATEGORIES`; функция `cloneFromPlatform(templateId)`
- `src/components/admin/broadcast/CampaignsManager.tsx` (вкладка «Шаблоны») — встроить `EmailTemplateGallery` сверху, под ним — список своих
- `supabase/functions/send-campaign-email/index.ts` — расширение переменных `{{course_*}}`, `{{webinar_*}}`, `{{org_logo}}`, `{{org_phone}}`, `{{org_site}}`

### Миграции (одна, несколько SQL)
1. CREATE TABLE `proposal_presets` + RLS (`platform` читают все, `org` — `has_org_staff_permission(sales.manage)`)
2. ALTER `commercial_proposals` ADD COLUMN `preset_id uuid`, `intro_html text`, `outro_html text`
3. ALTER `email_campaigns` ADD COLUMN `linked_course_id uuid`, `linked_webinar_id uuid`
4. CREATE POLICY «platform email templates readable» на `email_templates`
5. INSERT 6 платформенных пресетов в `proposal_presets`
6. INSERT 12 платформенных шаблонов писем в `email_templates`

### Память
- Новый файл `mem://features/sales/proposal-presets-and-email-library` — пресеты КП с курсом, библиотека из 12 продающих писем, клонирование платформенных шаблонов в свои
- Обновить `mem://features/sales/crm-module-logic` — упомянуть пресеты и расширенную библиотеку

---

## Что НЕ делаю в этой итерации
- Не делаю встроенный визуальный конструктор писем (drag-n-drop) — оставляем HTML/preview как сейчас
- Не делаю A/B-тесты по пресетам (статистика по `preset_id` будет, тесты — позже)
- Не подключаю автоматическую отправку «после оплаты вебинара пришли промо КП» — это отдельная задача про триггеры/автоматизацию

