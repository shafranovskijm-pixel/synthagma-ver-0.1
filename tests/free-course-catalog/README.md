# Бесплатные собственные курсы платформы

Подготовлено 18 focused cases; на этапе source handoff не запускались.

Проверяются actual `CourseStoreDetailView`, `OrderDialog`, `MarketplaceHeroCards`, публичный loader и store fetch, а также pure ownership/landing mapping. Внешние I/O, комментарии и паспорт изолированы явными offline ports; Dialog focus/portal не является предметом этих проверок. Никаких отправок Telegram, почты, получения платного курса или DB writes.

Для запуска наложите candidate source paths на полный main157 (не запускайте частичную папку как самостоятельный проект). Сохраните существующий проверенный runtime с React, React DOM, Vitest, jsdom, Testing Library, Vite и текущими зависимостями приложения. Ничего устанавливать не требуется. Из собранного корня:

```sh
node node_modules/vitest/vitest.mjs run --config tests/free-course-catalog/vitest.config.mjs
```

Конфиг portable MJS, один worker, без retry. Node/runtime и время запуска координирует root.

Frontend показывает бесплатность только при точном nested source ID и текущем `courses.organization_id` платформы; listing owner должен совпадать либо быть explicit NULL по существующему legacy contract. Пропущенные owner fields не считаются доказательством. Серверный RPC остаётся авторитетным для цены, разрешений, лимитов и доставки: выпуск UI должен сопровождать согласованный root server/data пакет, иначе прежняя ненулевая цена в БД ещё может быть списана. В этом frontend-пакете SQL, история заказов, backend notifications, клиентские цены, тарифы платформы и СГТ не меняются.

Рекомендации — редакционная подборка шести exact source UUID из паспортов 2026.09, без обещания популярности или методического утверждения. Публичные остальные курсы сохраняются; недоступная/неоднозначная рекомендация не заменяется одноимённой записью. Внутри магазина выбор открывает точный ID; существующий административный callback остаётся текстовым поиском и не получает нового автоматического открытия.

Для own `CourseLanding` цена и pay-tier/external redirect presentation выводятся из current direct owner; сохранённый `landing_content` не переписывается. Используется существующий `enrollment_requests` flow. Чужие/unknown landing settings остаются тем же объектом. Старые hidden paid25 не публикуются; индивидуальная разработка программы не входит в пакет.
