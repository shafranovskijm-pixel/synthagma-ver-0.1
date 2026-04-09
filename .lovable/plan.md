

## Исправление скачивания документов: убрать лишние элементы и сделать корректный PDF

### Проблемы (со скриншота)

1. **Вверху печати видны "09.04.2026, 10:44" и "Lovable"** — это стандартные колонтитулы браузера при печати (дата, URL, заголовок страницы). Нужно убрать через CSS `@page { margin: 0; }` и `@media print`.
2. **Форма растянута некорректно** — HTML-документ не имеет фиксированных размеров A4, и `printHtmlContent` не настраивает размер страницы.
3. **Подпись/печать сместилась** — на скриншоте видно, что печать и подпись расположены не так, как задумано.

### Решение

#### 1. Улучшить `printHtmlToPdf.ts`

Обновить функцию `printHtmlContent`, чтобы она:
- Инжектила CSS с `@page { size: A4; margin: 15mm 20mm; }` в HTML перед печатью
- Добавляла `<title>` для корректного имени файла при "Сохранить как PDF"

#### 2. Обновить CSS в шаблоне акта (`generateAct.ts`)

Добавить в `<style>` секцию:
```css
@page { 
  size: A4; 
  margin: 15mm 20mm; 
}
@media print {
  body { 
    padding: 0; 
    margin: 0;
    -webkit-print-color-adjust: exact;
  }
}
```

Это уберёт колонтитулы браузера (дату, URL, "Lovable") и задаст правильные поля A4.

#### 3. Аналогично обновить все шаблоны документов

Те же `@page` стили нужно добавить в:
- `generateAttestationProtocol.ts` — шаблон протокола
- `generateEnrollmentOrder.ts` — шаблон приказа

### Файлы для изменения

| Файл | Что меняется |
|------|-------------|
| `src/utils/printHtmlToPdf.ts` | Инжектить `@page` CSS и `<title>` перед печатью |
| `src/utils/generateAct.ts` | Добавить `@page` и `@media print` стили в шаблон |
| `src/utils/generateAttestationProtocol.ts` | Добавить `@page` стили |
| `src/utils/generateEnrollmentOrder.ts` | Добавить `@page` стили |

