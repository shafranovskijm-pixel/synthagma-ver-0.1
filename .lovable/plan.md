
## Исправление отображения печати и подписи в документах

### Проблема
На скриншоте видно: печать растянута (не круглая), подпись плохо видна. Причина — в CSS шаблонов изображения имеют жёсткие размеры (`width: 80px; height: 80px` для печати), что искажает пропорции круглой печати.

### Решение

#### 1. `src/utils/generateAct.ts` — блок подписи исполнителя (строки 88-93)

Заменить стили изображений:
- **Печать**: убрать фиксированные `width/height`, использовать `width: 120px; height: auto;` — сохранит круглую форму
- **Подпись**: увеличить размер, добавить `height: auto` для сохранения пропорций, поднять `opacity`
- Контейнер `.sig-images`: увеличить, чтобы вместить оба изображения без обрезки

Новые стили:
```css
.sig-images { position: relative; width: 250px; height: 120px; }
.sig-stamp { left: 0; top: 0; width: 120px; height: auto; opacity: 0.9; }
.sig-sign { left: 50px; top: 20px; width: 160px; height: auto; opacity: 0.9; }
```

#### 2. `src/utils/generateAttestationProtocol.ts` — блок stampSignatureHtml (строки 73-77)

Аналогично: заменить `max-height: 80px; max-width: 80px` для печати на `width: 120px; height: auto;`, для подписи — `width: 160px; height: auto;`.

### Файлы для изменения

| Файл | Что |
|------|-----|
| `src/utils/generateAct.ts` | CSS для `.sig-stamp`, `.sig-sign`, `.sig-images` |
| `src/utils/generateAttestationProtocol.ts` | Inline стили для img печати и подписи |
