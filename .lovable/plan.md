
## Печать документов (удостоверений, дипломов, свидетельств) из журнала

### Что будет сделано

Добавить кнопку «Печать» (иконка принтера) в каждую строку таблицы журнала документов. При нажатии — генерируется HTML-документ формата A4 с данными записи и открывается диалог печати браузера (через существующий `printHtmlContent`).

### Реализация

**1. Новый файл: `src/utils/generateEducationDocument.ts`**

Функция `generateEducationDocumentHtml(record, orgData)` — генерирует полноценный HTML для печати на A4 в стиле Times New Roman:

- **Удостоверение** (certificate): заголовок «УДОСТОВЕРЕНИЕ О ПОВЫШЕНИИ КВАЛИФИКАЦИИ», серия, номер, рег. номер, ФИО, программа, часы, дата, город, подпись, М.П.
- **Диплом** (diploma): заголовок «ДИПЛОМ О ПРОФЕССИОНАЛЬНОЙ ПЕРЕПОДГОТОВКЕ», + присвоенная квалификация
- **Свидетельство** (qualification): заголовок «СВИДЕТЕЛЬСТВО О ПРОФЕССИИ РАБОЧЕГО, ДОЛЖНОСТИ СЛУЖАЩЕГО», + присвоенная квалификация/разряд

Все три шаблона используют данные из `EducationDocumentRecord` + данные организации (название, лицензия, город). Стили: `@page { size: A4; margin: 15mm 20mm; }`, шрифт Times New Roman.

Если у организации загружены печать/подпись (из `StampSignatureUploader` → Storage), они вставляются как `<img>` с opacity 0.9.

**2. Изменения в `src/hooks/useEducationDocumentsJournal.ts`**

- Добавить загрузку данных организации (`name`, `branding`, `license_number`) при инициализации — уже загружается в `loadData`, просто сохранить в state и вернуть из хука как `orgData`.

**3. Изменения в `src/components/organization/EducationDocumentsJournal.tsx`**

- Импортировать `Printer` из lucide-react и `generateEducationDocumentHtml` + `printHtmlContent`
- В строке таблицы (строка ~247), рядом с кнопками редактирования и удаления, добавить кнопку печати:
```tsx
<Button variant="ghost" size="icon" onClick={() => handlePrint(record)}>
  <Printer className="w-4 h-4" />
</Button>
```
- Функция `handlePrint`: вызывает `generateEducationDocumentHtml(record, orgData)` → `printHtmlContent(html, "Документ")`

### Результат

Менеджер нажимает иконку принтера → открывается стандартный диалог печати браузера с документом на бланке A4. Можно сразу печатать или сохранить как PDF.
