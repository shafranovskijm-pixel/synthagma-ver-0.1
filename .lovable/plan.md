

## Скачивание документов в PDF вместо HTML

### Проблема
Сейчас `downloadHtmlFile` скачивает файл как `.html`. Пользователь ожидает получить PDF.

### Решение
Библиотеки `jspdf` и `html2canvas` уже установлены в проекте. Заменю `downloadHtmlFile` на новую функцию `downloadHtmlAsPdf`, которая:

1. Fetch HTML по signed URL
2. Создаёт временный `div`, вставляет HTML
3. Рендерит через `html2canvas` в canvas
4. Конвертирует canvas в PDF через `jsPDF` (A4, с разбивкой на страницы)
5. Скачивает как `.pdf`

### Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src/utils/downloadHtmlFile.ts` | Переписать: fetch HTML → html2canvas → jsPDF → `.pdf` скачивание |
| `src/components/organization/tabs/DocumentsTab.tsx` | Обновить имя импорта (если изменится) |
| `src/components/admin/TariffsManager.tsx` | Аналогично |
| `src/components/organization/DocumentArchiveView.tsx` | Аналогично |
| `src/components/organization/OrdersArchive.tsx` | Аналогично |

### Техническая реализация

```typescript
// downloadHtmlFile.ts → downloadHtmlAsPdf
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export async function downloadHtmlAsPdf(url: string, fileName: string) {
  const res = await fetch(url);
  const html = await res.text();
  
  // Создаём временный контейнер с фиксированной шириной A4
  const container = document.createElement("div");
  container.style.width = "794px"; // A4 at 96dpi
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.innerHTML = html;
  // Извлекаем стили из HTML и применяем
  document.body.appendChild(container);
  
  const canvas = await html2canvas(container, { scale: 2, useCORS: true });
  document.body.removeChild(container);
  
  const pdf = new jsPDF("p", "mm", "a4");
  const imgWidth = 190;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const pageHeight = 277;
  
  let position = 10;
  let heightLeft = imgHeight;
  
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;
  
  while (heightLeft > 0) {
    position = heightLeft - imgHeight + 10;
    pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }
  
  const safeName = fileName.replace(/\.html$/, "") + ".pdf";
  pdf.save(safeName);
}
```

Во всех 4 компонентах заменю `downloadHtmlFile` на `downloadHtmlAsPdf`.

