
Сделаю не “ещё одну попытку наугад”, а жёстко починю именно предпросмотр и добавлю проверку, чтобы было видно, где застревает старая версия.

### Что реально видно по коду сейчас
Судя по коду, новые aurora-варианты уже подключены:
- `aurora.ts` задаёт:
  - `audience_layout: "wide-feature-row"`
  - `benefits_layout: "aurora-showcase"`
  - `pricing_layout: "aurora-spotlight"`
  - `reviews_layout: "aurora-quotes"`
  - `faq_layout: "aurora-glass"`
- `LandingTemplatePreviewDialog.tsx` уже рендерит живые секции через `LandingThemeProvider`.
- `LandingAudienceSection.tsx` должен выбирать `AudienceWideFeatureRow`, а не `AudienceGrid`.

Но ваш скрин показывает именно старую сетку Audience. Значит проблема не в “идее шаблона”, а в том, что **предпросмотр у вас продолжает брать старое состояние/старую сборку**, и это надо чинить системно.

### Что сделаю
#### 1. Добавлю явную диагностику прямо в окно предпросмотра
В шапке превью и/или поверх первой секции покажу технический бейдж:
- версия приложения
- `template.id`
- активные layout-ключи:
  - `audience_layout`
  - `benefits_layout`
  - `pricing_layout`
  - `reviews_layout`
  - `faq_layout`

Пример:
```text
aurora · v1.0.33
audience: wide-feature-row
benefits: aurora-showcase
pricing: aurora-spotlight
faq: aurora-glass
```

Это сразу даст ответ:
- если в бейдже старые значения — застрял сам шаблон/кэш;
- если в бейдже новые значения, а UI старый — значит ломается диспетчер/рендер конкретной секции.

#### 2. Усилю принудительный remount не только для provider, а для всего preview-дерева
Сейчас `key` висит только на `LandingThemeProvider`.
Этого может быть недостаточно.

Сделаю так, чтобы **полностью пересоздавался весь preview subtree** при:
- смене шаблона
- смене `APP_VERSION`
- открытии диалога

То же самое сделаю для:
- `LandingTemplatePreviewDialog`
- `LandingTemplateMiniPreview`

Чтобы React гарантированно не держал старые ветки.

#### 3. Добавлю кнопку “Обновить предпросмотр” / “Сбросить кэш предпросмотра”
Подключу уже существующий `forceClientRefresh()` прямо в UI предпросмотра или рядом с галереей шаблонов.

Это даст нормальный пользовательский путь без плясок:
- нажал кнопку
- очистились service worker / cache storage / version keys
- страница жёстко перезагрузилась

То есть больше не будет сценария “я не понимаю, где ты вообще это менял”.

#### 4. Проброшу версию в мини-превью и full preview как часть ключей
Добавлю `APP_VERSION` в ключи:
- карточек в `LandingTemplatesGallery`
- `LandingTemplateMiniPreview`
- `LandingTemplatePreviewDialog`

Чтобы при любом бампе версии карточки и диалог не жили на старом дереве.

#### 5. Проверю место, где тема может подменяться/съедаться
Отдельно поправлю, если нужно:
- `LandingTemplatePreviewDialog.tsx`
- `LandingTemplateMiniPreview.tsx`
- `LandingThemeProvider.tsx`

Цель — убедиться, что `template.theme` доходит до секций без промежуточной подмены дефолтами.

#### 6. Если диагностика покажет, что превью получает новые layout-ключи, но рисует старое — исправлю именно сломанный renderer
Первый подозреваемый по вашему скрину — `LandingAudienceSection` / `AudienceWideFeatureRow`.
Если выяснится, что проблема именно в ветке рендера, поправлю её отдельно, а не буду снова трогать весь шаблон целиком.

### Что изменю в коде
- `src/components/course-editor/LandingTemplatePreviewDialog.tsx`
- `src/components/course-editor/LandingTemplateMiniPreview.tsx`
- `src/components/course-editor/LandingTemplatesGallery.tsx`
- `src/components/course-landing/LandingThemeProvider.tsx`
- возможно `src/components/course-landing/LandingAudienceSection.tsx`
- `src/lib/appVersion.ts`

### Что получится
После этого у вас будет не “верь мне, изменения есть”, а понятная картина:
1. в предпросмотре сразу видно, какая версия и какие layout-ключи реально активны;
2. preview и mini-preview будут жёстко пересоздаваться после обновления;
3. появится кнопка ручного сброса stale preview;
4. если сломан не кэш, а конкретный renderer — это будет локализовано и исправлено.

### Критерий готовности
Работа считается завершённой, только если:
- в окне предпросмотра виден диагностический бейдж с aurora-layout-ключами;
- после открытия Авроры в бейдже указано `wide-feature-row`, а секция Audience действительно уже не 3 одинаковые карточки;
- mini-preview и full preview показывают новую Аврору, а не старую сетку;
- есть понятный способ ручного сброса stale preview без догадок.

### Техническая причина, которую исправляю
Проблема сейчас не выглядит как “шаблон не создан”. Шаблон в коде уже собран. Проблема выглядит как **рассинхрон между актуальным кодом шаблона и тем, что реально рисует preview**. Поэтому следующий шаг — не снова рисовать Аврору, а **сделать предпросмотр прозрачным, принудительно пересоздаваемым и самодиагностируемым**.
