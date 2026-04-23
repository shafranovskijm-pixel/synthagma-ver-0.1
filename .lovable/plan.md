

# План: дополнительная оптимизация — то, что реально замедляет приложение

Прошёл по коду ещё раз. Маршруты уже lazy, SMTP консолидирован, denomailer удалён — это сделано. А вот реальные проблемы, которые остались:

## Что нашёл

### 1. Кабинет организации почти не использует React Query (главная боль)
`useQuery` встречается во **всём кабинете организации** ровно в **1 файле**, при этом **39 файлов** делают `useEffect + supabase.from(...)` напрямую. В `CoursesTab.tsx` (547 строк), `UsersManager.tsx`, `StudentsTab.tsx` — **0 useQuery**.

Что это значит на практике:
- Переключился между вкладками → данные грузятся заново.
- Открыл карточку студента, вернулся → снова запрос.
- Нет дедупликации одинаковых запросов.
- Нет background refetch.

QueryClient в `App.tsx` уже настроен (`staleTime: 5 мин`, `gcTime: 30 мин`), но им почти никто не пользуется в самом нагруженном кабинете.

**Что делаю:** перевожу 6 самых горячих мест на React Query (оставляю остальные как есть, чтобы не разнести проект):
- `useCoursesTab` / `useCourseDetails` — список курсов и студентов курса.
- Вкладка «Студенты» (`StudentsTab` + `useOrganizationStudents`).
- `WebinarsManager` — список вебинаров.
- `useOrganizationDashboard` — счётчики и подписка.
- `IncomingDocumentsManager`.
- `OrgProfileTab` — данные профиля.

Для каждого: завожу `queryKey` вида `['org', orgId, 'students']`, после mutation делаю `invalidateQueries`. Visible эффект — переходы по табам перестают «моргать» и перезапрашивать.

### 2. ElevenLabs — формально удалён, фактически живой

Память говорит «ElevenLabs удалён в пользу SaluteSpeech», но в коде:
- `supabase/functions/elevenlabs-tts/index.ts` — функция работает.
- `src/hooks/useElevenLabsTTS.ts` — используется в `useLessonTTS` и `TTSSettingsDialog`.
- В UI настроек пользователю до сих пор предлагается выбрать ElevenLabs как провайдер.
- `ELEVENLABS_API_KEY` фигурирует в админ-настройках.

То есть пользователь может выбрать ElevenLabs, заплатить за ключ, а потом мы это удалим. Надо привести к одному состоянию.

**Что делаю:** убираю ElevenLabs целиком (раз в памяти решено).
- Удаляю edge `elevenlabs-tts`.
- Удаляю `src/hooks/useElevenLabsTTS.ts`.
- Из `useLessonTTS.ts` убираю ветку `provider === 'elevenlabs'`.
- Из `TTSSettingsDialog`, `AISettingsManager`, `AITestSandbox`, `AIAvatarLessonEditor`, `AIGenerateDialog`, `constants.ts` убираю опцию `elevenlabs` и упоминания.
- В `manage-secret` убираю `ELEVENLABS_API_KEY` из списка.
- Если у пользователя в localStorage стоит `provider: 'elevenlabs'` — миграция в `getStoredTTSSettings`: подменяю на `'salutespeech'` тихо.

### 3. MazeGame блокирует bundle public-страниц

`src/components/student/MazeGame.tsx` импортирует `@react-three/fiber` и `@react-three/drei` синхронно. Three.js — это ~600 KB. Сейчас, скорее всего, попадает в bundle любого, кто открывает дашборд студента, хотя 3D-тренажёр открывает 1 из 100.

**Что делаю:** оборачиваю `MazeGame` в `lazyWithRetry`, рендерю под `<Suspense>`. Минус ~600 KB из initial bundle студенческого кабинета.

### 4. Огромные компоненты подписания загружаются всегда

`ContractReviewBody.tsx` (1026 строк) и `ReviewableDocument.tsx` (949) импортируются синхронно из `AdminBillingOverview`, `CounterpartiesSection`, `ContractReviewDialog`. Они нужны только когда пользователь открыл диалог рецензии договора.

**Что делаю:** заменяю прямые импорты на `lazyWithRetry` + `<Suspense fallback={...}>` в трёх местах. Минус ~150 KB при первом открытии страниц «Документы» и «Биллинг».

### 5. 601 `console.log/warn/error` в продакшене

Я не буду удалять их вручную (риск убрать полезное в catch). Вместо этого:
- В `vite.config.ts` включаю `esbuild.drop: ['console', 'debugger']` для production-сборки. Dev остаётся как есть.
- Проверяю, что `console.error` в catch-блоках, который реально нужен для Sentry-подобной диагностики, оборачиваю в утилиту `logError` (если такая нужна — сначала проверю, есть ли она; если нет — оставляю drop как глобальное правило).

Это не «мнимая» оптимизация: 601 строка вызовов сериализует объекты, многие — большие (массивы курсов, студентов). На мобильном это заметно.

### 6. Topbar и сайдбар: лишние ререндеры из-за нестабильных объектов

В `OrgSidebar.tsx` и `OrgLayout` `useStaffPermissions()` возвращает новый объект при каждом рендере → каждый клик в меню перерисовывает всё дерево сайдбара.

**Что делаю:** в `useStaffPermissions` (хук) оборачиваю возвращаемое значение в `useMemo` по реальным зависимостям. Не трогаю сам сайдбар, чтобы не сломать DnD/permissions, — фикс на уровне источника. Эффект распространится на всё, что использует хук.

## Что НЕ делаю
- Не перевожу все 39 файлов на React Query — это слишком большой рефакторинг за один заход. Только 6 самых горячих.
- Не удаляю `console.*` руками — только через build-конфиг.
- Не трогаю `OrgSidebar.tsx` напрямую (защита от регрессий).
- Не оптимизирую `signing/*` рендер — только lazy-import.
- Не трогаю auth, RLS, edge-функции отправки писем.

## Порядок (4 коммита)

**A. Bundle-чистка (быстрый win)**
- `lazyWithRetry` для `MazeGame`, `ContractReviewBody`, `ReviewableDocument`.
- `vite.config.ts`: drop console в prod.

**B. Удаление ElevenLabs**
- Удаляю edge + hook.
- Чищу UI/настройки.
- Тихая миграция localStorage.

**C. React Query для горячих мест**
- 6 файлов переводятся на `useQuery` с `queryKey` + `invalidateQueries`.

**D. Стабилизация useStaffPermissions**
- `useMemo` на возвращаемое значение хука.

## Как проверим
1. Open DevTools → Network на `/organization`: переключение Курсы→Студенты→Курсы не вызывает повторных запросов в течение 5 минут.
2. Bundle-анализ (`npm run build`): initial размер `/organization` упал минимум на 500 KB.
3. В localStorage у юзера-«ElevenLabs» провайдер автоматически стал `salutespeech`, озвучка работает.
4. В прод-сборке `console.log` не попадают в бандл (поиск по `dist/*.js` ничего не находит).
5. Dev-сборка: `console.*` по-прежнему пишутся, ничего не сломалось в отладке.

