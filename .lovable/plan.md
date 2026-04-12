

# Встроенный плеер Kinescope с настройками для каждого вебинара

## Что делаем

Добавляем настраиваемый встроенный Kinescope-плеер в интерфейс вебинаров. Каждый вебинар получит индивидуальные настройки плеера, аналогичные тем, что доступны в панели Kinescope (как на скриншоте).

Kinescope embed поддерживает query-параметры для кастомизации: `autoplay`, `playsinline`, `muted`, `loop`, `autopause`, `preload`, `watermark`, а также параметры UI: `controls`, `playback-rate`, `chromecast`, `airplay`, `pip`, `fullscreen`, `cc`, `chapters`.

## Настройки плеера (для каждого вебинара)

**Поведение:**
- Автозапуск (autoplay)
- Автопауза при переключении вкладки (autopause)  
- Зацикливание (loop)
- Запуск без звука (muted)

**Элементы управления:**
- Скорость воспроизведения (playback-rate)
- Субтитры (cc)
- Полный экран (fullscreen)
- Картинка в картинке (pip)
- Chromecast / Airplay

**Водяной знак:**
- Текст водяного знака (watermark[text])

## Технические детали

### Шаг 1: Миграция — добавить колонку `player_settings` (JSONB)

```sql
ALTER TABLE public.webinars 
  ADD COLUMN IF NOT EXISTS player_settings JSONB DEFAULT '{}';
```

Формат JSON:
```json
{
  "autoplay": false,
  "autopause": true,
  "loop": false,
  "muted": false,
  "playbackRate": true,
  "subtitles": true,
  "fullscreen": true,
  "pip": true,
  "chromecast": true,
  "airplay": true,
  "watermarkText": ""
}
```

### Шаг 2: Компонент `WebinarPlayerSettings.tsx`

Новый компонент — диалог с переключателями (Switch) для каждой настройки плеера. Визуально похож на скриншот Kinescope: секции «Поведение», «Трансляция на устройства», «Элементы управления» с toggle-переключателями.

Открывается по кнопке ⚙️ «Настройки плеера» на карточке вебинара.

### Шаг 3: Обновить `WebinarsManager.tsx`

- Добавить кнопку «Настройки плеера» (иконка Settings) на каждой карточке
- При открытии embed-плеера — передавать query-параметры из `player_settings` в URL iframe

### Шаг 4: Обновить `StudentWebinarsList.tsx`

- При открытии embed-плеера студентом — применять `player_settings` вебинара к URL iframe (те же query-параметры)

### Шаг 5: Обновить `VideoPlayerInline.tsx` и `courseBuilderHelpers.ts`

- Функция `getKinescopeEmbedUrl` получит опциональный параметр `playerSettings` для формирования URL с query-параметрами

### Формирование URL с настройками

```typescript
function buildKinescopeUrl(videoId: string, settings: Record<string, any>) {
  const params = new URLSearchParams();
  if (settings.autoplay) params.set('autoplay', '1');
  if (settings.muted) params.set('muted', '1');
  if (settings.loop) params.set('loop', '1');
  if (settings.autopause === false) params.set('autopause', '0');
  if (!settings.playbackRate) params.set('playback-rate', '0');
  if (!settings.fullscreen) params.set('fullscreen', '0');
  if (!settings.pip) params.set('pip', '0');
  if (!settings.subtitles) params.set('cc', '0');
  if (settings.chromecast === false) params.set('chromecast', '0');
  if (settings.airplay === false) params.set('airplay', '0');
  if (settings.watermarkText) params.set('watermark[text]', settings.watermarkText);
  const qs = params.toString();
  return `https://kinescope.io/embed/${videoId}${qs ? '?' + qs : ''}`;
}
```

## Затрагиваемые файлы

- **Новый:** `src/components/organization/WebinarPlayerSettings.tsx` — диалог настроек плеера
- **Миграция SQL** — колонка `player_settings JSONB`
- **Изменение:** `src/components/organization/WebinarsManager.tsx` — кнопка настроек + применение к embed
- **Изменение:** `src/components/student/StudentWebinarsList.tsx` — применение настроек к embed
- **Изменение:** `src/utils/courseBuilderHelpers.ts` — функция buildKinescopeUrl

