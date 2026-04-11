

## Исправить отображение печати и подписи в Word-экспорте

### Проблема
При скачивании договора в формате Word (.doc) печать и подпись растягиваются на всю страницу. Причина — использование `position: absolute` в CSS, которое Word не поддерживает корректно. В предпросмотре (HTML в браузере) всё выглядит нормально.

### Решение

**Файл: `src/constants/contractTemplates.ts`** (строки 163–166)

Заменить блок с `position: absolute` на простую табличную вёрстку, которую Word корректно обрабатывает:
- Вместо `div` с абсолютным позиционированием — `<table>` с одной строкой и двумя ячейками (печать слева, подпись справа)
- Фиксированные размеры через атрибуты `width`/`height` на `<img>` (не только CSS)
- Убрать `position: absolute` — Word его не понимает и рендерит изображения на всю ширину

```html
<!-- Было: -->
<div style="position:relative;height:80px;margin:12px 0;">
  <img src="..." style="position:absolute;left:0;top:-20px;height:100px;opacity:0.85;" />
  <img src="..." style="position:absolute;left:60px;top:0;height:60px;opacity:0.9;" />
</div>

<!-- Станет: -->
<table style="margin:12px 0;border:none;border-collapse:collapse;">
  <tr>
    <td style="border:none;padding:0;vertical-align:bottom;">
      <img src="..." width="100" height="100" style="height:100px;width:auto;opacity:0.85;" />
    </td>
    <td style="border:none;padding:0 0 0 10px;vertical-align:bottom;">
      <img src="..." width="80" height="60" style="height:60px;width:auto;opacity:0.9;" />
    </td>
  </tr>
</table>
```

Одно изменение в одном файле — печать и подпись будут корректно отображаться и в браузере, и в Word.

