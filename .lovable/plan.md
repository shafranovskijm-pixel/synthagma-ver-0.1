
Что я подтвердил по коду сейчас

1. Для текстовых уроков с video-блоками логика уже стала общей:
   - `CoursePreviewView` для `lesson.type === "text"` рендерит `BlockRenderer`;
   - `CourseLearning` для `lesson.type === "text"` тоже рендерит `BlockRenderer`;
   - в `BlockRenderer` `case "video"` уже использует `VideoPreviewInline content={block.videoUrl} eager`.

Это значит: именно сценарий из первого урока, где видео лежит внутри текстового урока как `videoUrl: "kinescope:..."`, теперь должен одинаково идти и в preview, и у студента, и для старых, и для новых курсов такого формата.

2. Для обычных видео-уроков (`lesson.type === "video"`) логика всё ещё не до конца унифицирована:
   - preview использует `VideoPreviewInline`;
   - студент использует отдельный `VideoPlayerInline` со своей собственной копией парсинга URL/iframe/Kinescope/HLS.

Почему это важно:
- для вашего текущего кейса video-блока внутри текстового урока узкое место уже закрыто;
- но “везде и навсегда одинаково” я по коду пока не могу честно подтвердить, потому что standalone video-уроки всё ещё живут на двух разных ветках логики.

Что сделаю, чтобы это было действительно надёжно везде

1. Уберу дублирование видеологики
- приведу `VideoPlayerInline` к использованию общих helper-функций из `courseBuilderHelpers`;
- исключу локальные копии `getVideoEmbedUrl`, `isDirectVideoFileUrl`, Kinescope/HLS-детекта.

2. Зафиксирую единую схему рендера
- text lesson + video-block → общий `BlockRenderer` → `VideoPreviewInline`;
- preview для `lesson.type="video"` → общий `VideoPreviewInline`;
- student для `lesson.type="video"` → тот же общий разбор источника, но с сохранением student-логики прогресса/перемотки.

3. Проверю все 4 сценария перед применением результата
- Kinescope внутри text lesson как `video-block`;
- `.ts/.m3u8` внутри text lesson как `video-block`;
- Kinescope как отдельный `lesson.type="video"`;
- `.ts/.m3u8` как отдельный `lesson.type="video"`.

4. Что будет гарантировано после этого
- старые и новые курсы будут проходить через одну и ту же видеологику;
- preview и student не будут расходиться по Kinescope/TS/HLS;
- новые исправления по видео больше не придётся вносить в 2–3 местах отдельно.

Технически
```text
Сейчас:
text lesson/video-block -> BlockRenderer -> VideoPreviewInline
preview video lesson    -> VideoPreviewInline
student video lesson    -> VideoPlayerInline (отдельная логика)

После правки:
text lesson/video-block -> общий video pipeline
preview video lesson    -> общий video pipeline
student video lesson    -> общий video pipeline + student progress wrapper
```

Итог по вашему вопросу
- Для video-блоков внутри текстовых уроков логика уже откалибрована и должна работать и в preview, и у студента, в том числе для новых курсов.
- Но чтобы я мог честно сказать “теперь везде хорошо отображается”, нужно ещё добить последнее расхождение: отдельные video-уроки в student-ветке.
- После этого будет одна нормальная, единая логика без рассыпания по режимам.
