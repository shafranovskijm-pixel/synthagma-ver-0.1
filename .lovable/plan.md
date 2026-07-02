## 1. Скрипт звонка — раскрыть сокращения и слить в один текст

`src/constants/coldCallScript.ts`:
- Заменить «ДПО» → «дополнительное профессиональное образование» и «КП» → «коммерческое предложение» во всех репликах (start / questions / objections / closing / shortScript30s).
- Ключевую реплику из `start` (сейчас 5 отдельных строк) переписать в **один связный монолог** длиной 4-6 предложений — приветствие + представление + оффер («…запускаем дистанционное обучение, ведём документы, курсы, слушателей…») + короткий уточняющий вопрос «Подскажите, вы дистанционно обучаете, есть ли у вас платформа дистанционного обучения?». Оставить один элемент `items` вместо пяти.
- Аналогично сократить `shortScript30s` до 1-2 связных абзацев.

## 2. Караоке-подсветка при звонке

Новый компонент `src/components/admin/sales/KaraokeScript.tsx`:
- Принимает `text: string`, `active: boolean`, `wpm?: number` (по умолчанию ~140).
- Разбивает текст на слова, при `active=true` включает `requestAnimationFrame` таймер, подсвечивает текущее слово (`bg-primary/20 text-foreground rounded`) и уже произнесённые (`text-muted-foreground`).
- Кнопки: пауза / рестарт.

`CompanyDrawer.tsx`:
- Хранить `isCalling: boolean`, включать при клике «Позвонить», выключать при закрытии `CallResultModal`.
- Над табами (или наверху вкладки «Скрипт») показывать `<KaraokeScript text={monolog} active={isCalling} />` — берём тот самый монолог из `start`, прогнанный через `fillScriptTemplate`.

## 3. Два готовых КП (шаблоны платформы)

SQL-миграция вставляет две строки в `commercial_proposals` со `scope='platform'`, `is_template=true`, `created_by=<текущий admin>` и связанные `commercial_proposal_services`:

**КП «Синтагма — платформа СДО»**
- intro: краткое описание платформы (курсы, ученики, документы, ФИС ФРДО, КП, договоры, вебинары).
- Услуги: «Тариф Старт», «Тариф Профессиональный», «Готовые курсы (300+)», «Внедрение и обучение» — цены из `subscriptionPlans.ts`.
- outro: контакты + `<SignatureStampBlock/>`-совместимый плейсхолдер (уже в шаблоне письма).

**КП «Дополнительные услуги СИНТАГМА»**
- Услуги:
  - «Выгрузка в ФИС ФРДО» — 24 000 ₽
  - «Разработка сайта учебного центра» — от 10 000 ₽ (quantity 1)
  - «Разработка учебной документации» — «Цена по запросу» (price 0, в `custom_description` пометка).

Заодно фикс в `send-platform-proposal/index.ts`: если у услуги `price = 0`, выводим строку «Цена по запросу» вместо «0 ₽».

## 4. Быстрая отправка КП из карточки компании

`CompanyDrawer.tsx`, вкладка «Документы»:
- Новый блок «Отправить готовое КП»:
  - `Select` со списком платформенных шаблонов (грузим через уже существующий запрос из `LogActivityDialog`, вынесем в маленький хук `usePlatformProposalTemplates`).
  - `Input email` (префилл `lead.email`).
  - Кнопка «Отправить» → `supabase.functions.invoke('send-platform-proposal', …)` c `template_proposal_id`, `recipient_email`, `company_name`, `contact_person`, `lead_id`, `sender_name`. Toast + запись активности `email` через `addActivity`.
- Оставляем существующие кнопки «Создать КП / Создать договор».

## 5. End-to-end проверка

После деплоя миграции и функции:
1. Дергаем `send-platform-proposal` дважды через `supabase.functions.invoke` из скрипта sandbox — по одному для каждого нового шаблона, `recipient_email = 24@24zxc.ru`, `company_name = "Тестовая проверка"`.
2. Проверяем ответ (`ok: true`, `proposal_url`).
3. Сообщаем пользователю, что оба письма отправлены, с публичными ссылками на КП.

## Технические детали

- Файлы, которые меняются: `src/constants/coldCallScript.ts`, `src/components/admin/sales/CompanyDrawer.tsx`, `src/components/admin/sales/ColdCallScriptCard.tsx` (мелко, чтобы монолог не дублировался), новый `src/components/admin/sales/KaraokeScript.tsx`, `supabase/functions/send-platform-proposal/index.ts` (форматирование «Цена по запросу»).
- Новая миграция `supabase/migrations/*_seed_platform_proposal_templates.sql` — идемпотентный `INSERT … WHERE NOT EXISTS` по имени.
- Никаких изменений RLS/GRANT: `commercial_proposals` уже настроен.
- Деплоим `send-platform-proposal` после правки.
