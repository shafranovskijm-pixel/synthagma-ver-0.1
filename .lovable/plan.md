
## Где сейчас не воспроизводится `.ts`

Я прошёл по всем местам, где играется видео. После прошлого этапа уже работают:
- редактор (`LessonEditor.tsx` → `VideoPreviewInline` → `HlsVideoPlayer`),
- список уроков (`SortableLessonItem.tsx`) — то же,
- студент в `CourseLearning` (`VideoPlayerInline` из `course-learning/` уже умеет HLS через hls.js).

Не работает **только** «Просмотр» курса (кнопка "Просмотр" в редакторе → `CoursePreviewView`):

В `src/components/course-preview/CoursePreviewView.tsx` определён **локальный** `VideoPreview` (строки 53–76):
- его собственный `getVideoEmbedUrl` не знает про `.ts/.m2ts/.mts/.m3u8` и про `selcdn.ru`;
- ссылка `.ts` попадает в общий `if (content.match(/^https?:\/\/.+/i))` и подставляется в `<iframe src=...>` — браузер не может проиграть TS как страницу;
- HLS / hls.js не подключён вообще.

Ровно поэтому в «Просмотре» TS не показывается. Тот же эффект мог быть и у студента, если урок открывался через preview-роут.

## Что сделаю

### 1) Заменить локальный `VideoPreview` в `CoursePreviewView.tsx` на общий
- удалить локальные `getVideoEmbedUrl` / `VideoPreview` / `canEmbedInIframe` в `CoursePreviewView.tsx`;
- импортировать и использовать уже существующий `VideoPreviewInline` из `@/components/course-builder/VideoPreviewInline` — он уже:
  - распознаёт `.ts/.m2ts/.mts/.m3u8/.mpg/.mpeg` через общий `isDirectVideoFileUrl`,
  - проигрывает их через `HlsVideoPlayer` (hls.js),
  - корректно показывает Kinescope, YouTube, Vimeo, Rutube, VK, OK, Дзен, Mail, Yandex, iframe-embed,
  - для не-встраиваемых сервисов даёт «Открыть видео».

Результат: в «Просмотре» курса TS-файлы будут играть так же, как в редакторе.

### 2) Подстраховать студенческий плеер на edge-кейс «embed-URL → TS»
В `src/components/course-learning/VideoPlayerInline.tsx` уже есть `directVideoSrc` для случая, когда `embedResult.url` оказался прямым видеофайлом — это уже корректно. Просто перепроверю, что `isMpegTsFileUrl(resolvedContent)` срабатывает и для TS, пришедшего через `embedResult.url`. Если найду расхождение — поправлю одной строкой.

Никакие другие компоненты не трогаю — там HLS уже подключён.

### 3) Проверка
1. Открыть урок с `.ts`-видео → нажать «Просмотр» курса → видео играет (hls.js).
2. Открыть тот же урок как студент → видео играет.
3. Открыть урок с обычным `.mp4` → как раньше, без регрессии.
4. Открыть урок с YouTube/Kinescope → как раньше.
5. Если браузер совсем не поддерживает MSE — показывается аккуратный fallback «Скачать видео» из `HlsVideoPlayer`.

## Файлы, которые буду менять

- `src/components/course-preview/CoursePreviewView.tsx` — заменить локальный `VideoPreview` на `VideoPreviewInline`, убрать дубль-хелперы.
- (опционально, точечно) `src/components/course-learning/VideoPlayerInline.tsx` — только если найду, что TS из `embedResult.url` не уходит в hls-ветку.
