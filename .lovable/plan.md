

## Исправление превью видео в медиатеке

### Причина проблемы

Компонент `VideoThumbnail` пытается:
1. Загрузить видео с внешнего хранилища с `crossOrigin = "anonymous"`
2. Нарисовать кадр на `<canvas>` через `drawImage()`

Внешний Supabase Storage не отдаёт заголовок `Access-Control-Allow-Origin` для видеофайлов, поэтому canvas считается "tainted" и операция блокируется. Компонент ловит ошибку и показывает иконку.

### Решение

Заменить подход с canvas на нативный HTML `<video>` элемент с `preload="metadata"`. Браузер сам покажет первый кадр видео без CORS-ограничений, потому что `<video>` тег не подчиняется тем же правилам что canvas.

**Компонент VideoThumbnail** будет переписан:
- Вместо скрытого video + canvas — видимый `<video>` элемент размером 40x40
- `preload="metadata"` — загрузит только метаданные и первый кадр
- `muted`, без `crossOrigin` — избегаем CORS
- При ошибке загрузки — fallback на иконку Video
- Видео не воспроизводится (нет controls, нет autoplay) — только статичный кадр

### Технические изменения

**Файл: `src/components/course-builder/MediaLibraryDialog.tsx`**

Заменить компонент `VideoThumbnail` (строки 69-137):

```tsx
function VideoThumbnail({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <Video className="w-5 h-5 text-destructive" />;
  }

  return (
    <video
      src={url}
      muted
      preload="metadata"
      className="w-full h-full object-cover rounded"
      onError={() => setFailed(true)}
    />
  );
}
```

Это просто, надёжно и не зависит от CORS. Браузер покажет первый кадр видео как постер автоматически.

