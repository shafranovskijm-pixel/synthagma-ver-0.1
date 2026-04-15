

# Встроенное радио в платформу

## Как это работает

RadioAPI.me предоставляет только **метаданные** (название трека, обложка, исполнитель). Само воспроизведение — через прямые URL аудиопотоков (Icecast/Shoutcast) в HTML5 `<audio>`. Это значит:

- Нужны прямые ссылки на потоки радиостанций (публичные, например Radio Record, Europa Plus и т.д.)
- RadioAPI опционально — для красивого отображения «сейчас играет». Можно начать без него, просто с набора станций

## Архитектура

### Данные

Таблица `radio_stations` (seed с популярными станциями):
- `id`, `name`, `stream_url` (Icecast/Shoutcast URL), `logo_url`, `genre`, `radioapi_stream_id` (nullable), `is_active`, `sort_order`

Пользовательские настройки в `profiles` — новое JSON-поле `radio_settings`:
- `{ favoriteStationId, volume, autoplay }`

### Компоненты

1. **RadioPlayer** (глобальный, в header) — маленькая кнопка-иконка `Radio` рядом с колокольчиком:
   - Клик = play/pause текущей станции
   - Анимация пульсации когда играет
   - Мини-попап при hover/клик: название станции + трек (если есть radioapi), кнопка громкости

2. **RadioSettings** (в профиле ученика, новая вкладка/секция):
   - Список станций с preview
   - Выбор любимой станции (она будет по умолчанию)
   - Ползунок громкости
   - Переключатель автозапуска

3. **useRadioPlayer** (хук):
   - Синглтон `<audio>` элемент
   - Состояние: playing, currentStation, volume, currentTrack
   - Polling RadioAPI каждые 15 сек для метаданных (если есть stream_id)
   - Persist volume/station в localStorage

### UX-поток

- Ученик заходит → в header видит иконку радио (выключено)
- Нажимает → играет последняя выбранная станция (или первая из списка)
- В профиле → выбирает станцию, громкость
- Радио продолжает играть при навигации между страницами

## Начальные станции (seed)

Популярные русскоязычные интернет-радио с публичными потоками:
- Radio Record, Europa Plus, Русское Радио, DFM, Retro FM и др.

## Файлы

| Файл | Действие |
|---|---|
| Миграция SQL | Таблица `radio_stations` + seed данные |
| `src/hooks/useRadioPlayer.ts` | Хук с audio singleton, polling метаданных |
| `src/components/radio/RadioPlayerButton.tsx` | Кнопка в header с мини-попапом |
| `src/components/radio/RadioSettings.tsx` | Настройки в профиле |
| `src/components/student/StudentHeader.tsx` | Добавить RadioPlayerButton |
| `src/components/organization/OrgDashboardHeader.tsx` | Добавить RadioPlayerButton (для менеджеров) |

## Ограничения

- RadioAPI stream_id пока оставим nullable — заполним позже через их дашборд
- Без stream_id метаданные трека не показываются, но музыка играет
- Некоторые станции могут блокировать CORS — нужно будет проверить конкретные URL

