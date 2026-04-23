

# План: «Устранение ошибок файлов ФРДО» с переносом в оригинальный xlsm-шаблон

## Корень проблемы

Сейчас «Очистка чужого файла» собирает новый .xlsx с нуля через ExcelJS — итоговый файл ~40 KB без макросов и метаданных шаблона. ФИС ФРДО проверяет «отпечаток» шаблона (`vbaProject.bin`, defined names, validations) и отклоняет всё, что собрано не из его донора → «В предоставленном файле неизвестный шаблон».

Решение: брать оригинальный шаблон 262 KB как бинарный донор и **подменять только данные** внутри него, сохраняя VBA, темы, валидации, defined names.

## Что меняется в продукте

### 1. Переименование функции
- «Очистка чужого файла ФИС ФРДО» → **«Устранение ошибок файлов ФРДО»**
- Кнопка в `FRDOManager.tsx`: «Очистить чужой файл» → **«Устранить ошибки ФРДО»** (иконка `Wrench` вместо `Wand2`)
- Заголовок диалога и описание — в духе «редактора ошибок»: «Загрузите файл, который не принимает ФИС ФРДО — мы исправим формат, перенесём данные в эталонный шаблон Рособрнадзора и вернём готовый .xlsm»
- На странице `/feature/frdo` тоже подправляются заголовки CTA-блока

### 2. Хранение оригинальных шаблонов-доноров

Загруженный пользователем файл `Shablon.xlsx` (262 KB, ПО) кладётся в проект как бинарный ассет:

```text
src/assets/frdo/template-po.xlsx   ← исходный 262 KB шаблон (PO)
src/assets/frdo/template-dpo.xlsx  ← плейсхолдер, добавится позже когда пользователь загрузит ДПО шаблон
```

Vite уже умеет грузить .xlsx как `?url` или `?arraybuffer` — используем `import templatePoUrl from "@/assets/frdo/template-po.xlsx?url"` и `fetch(url)` → `arrayBuffer()`.

### 3. Новый модуль `src/utils/frdoTemplateInjector.ts`

Логика «вливания данных в донора»:

```text
1. fetchTemplateBuffer(type)            → ArrayBuffer оригинального .xlsx/.xlsm
2. JSZip.loadAsync(buffer)              → распаковываем zip-структуру xlsx
3. Читаем xl/worksheets/sheet1.xml      → находим первый sheet
4. Читаем xl/sharedStrings.xml          → получаем индекс существующих строк
5. Находим строку с заголовками         → определяем стартовую строку данных (обычно 2)
6. Удаляем все существующие <row r="2"…>, <row r="3"…> ниже шапки
7. Для каждой нашей строки данных:
     - формируем <row r="N">…<c …><v>…</v></c></row>
     - текстовые значения добавляем в sharedStrings и ссылаемся inlineStr
     - даты — в формате dd.MM.yyyy как inlineStr (как требует ФИС ФРДО)
     - СНИЛС — inlineStr (текстовый формат уже задан в шаблоне)
     - числа (год, часы) — как <c t="n"><v>2024</v></c>
8. Обновляем <dimension ref="A1:AO{N}"> в sheet1.xml
9. JSZip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12" })
10. Имя файла: ФИС_ФРДО_PO_очищено-DD-MM-YYYY.xlsm
```

Все остальные части zip (`vbaProject.bin`, `xl/styles.xml`, `xl/theme/`, `_rels/`, `[Content_Types].xml`, `xl/worksheets/_rels/sheet1.xml.rels` с валидациями) **остаются нетронутыми** — отсюда и сохраняется размер ~262 KB и подпись шаблона.

### 4. Изменения в `FrdoFileSanitizerDialog.tsx`

- При нажатии «Скачать чистый файл» вместо `exportFRDOExcel(rows, type)` вызываем:
  ```ts
  await injectIntoFrdoTemplate(rows, result.type, suffix)
  ```
- Если шаблон-донор для типа отсутствует (DPO пока) — fallback на текущий ExcelJS-экспорт с предупреждением «Эталонный шаблон ДПО ещё не загружен — выгрузка в упрощённом формате»
- Кнопка скачивания получает подсказку: «Файл с макросами оригинального шаблона ФИС ФРДО»
- В сводке добавляется строка «Шаблон-донор: оригинальный ПО (262 КБ, с макросами)»

### 5. Не трогаем

- Массовый экспорт ФРДО (`useFRDOManager.handleBulkExport`) и индивидуальный экспорт по студенту (`FRDOExportDialog`) — остаются на ExcelJS (по решению пользователя «Только редактор»)
- Структуру таблиц, RLS, edge-функции — изменений нет
- Все остальные модули

## Технические детали

**Зависимости:** `jszip@3.10.1` уже стоит (используется ExcelJS внутри). Никаких новых пакетов.

**Размер бандла:** оригинальный шаблон ~262 KB будет загружаться **по требованию** (динамический `import("@/assets/frdo/template-po.xlsx?url")` внутри `injectIntoFrdoTemplate`), так что он не попадёт в основной chunk и не повлияет на FCP.

**Совместимость с .xlsm:**
- Расширение файла → `.xlsm` если в zip есть `xl/vbaProject.bin`, иначе `.xlsx`
- MIME: `application/vnd.ms-excel.sheet.macroEnabled.12` для xlsm
- `[Content_Types].xml` уже содержит правильные регистрации, мы их не трогаем

**Парсинг XML:** используем нативный `DOMParser` + `XMLSerializer` (есть в браузере, размер 0 KB). Избегаем регулярок — нужна корректная работа с пространствами имён `<row xmlns="…">`.

**Вставка строк (упрощённая логика):**
```ts
const sheetXml = await zip.file("xl/worksheets/sheet1.xml").async("string");
const doc = new DOMParser().parseFromString(sheetXml, "application/xml");
const sheetData = doc.getElementsByTagName("sheetData")[0];

// Удалить все <row> ниже заголовка
Array.from(sheetData.getElementsByTagName("row"))
  .filter(r => Number(r.getAttribute("r")) >= 2)
  .forEach(r => r.parentNode!.removeChild(r));

// Добавить новые строки с inline strings
rows.forEach((row, i) => {
  const rowEl = doc.createElementNS(NS, "row");
  rowEl.setAttribute("r", String(i + 2));
  row.forEach((value, colIdx) => {
    const cell = makeInlineStringCell(doc, colIdx, i + 2, value);
    rowEl.appendChild(cell);
  });
  sheetData.appendChild(rowEl);
});

zip.file("xl/worksheets/sheet1.xml", new XMLSerializer().serializeToString(doc));
```

**Тесты (`src/utils/__tests__/frdoTemplateInjector.test.ts`):** проверяем, что после инъекции:
- размер выходного blob ≈ размер донора + размер данных (а не ~40 KB)
- vbaProject.bin сохранён
- значение из строки данных читается обратно

## Что увидит пользователь

1. В разделе ФРДО кнопка с молотком «Устранить ошибки ФРДО»
2. В диалоге заголовок «Устранение ошибок файлов ФРДО»
3. После обработки — кнопка «Скачать в шаблоне Рособрнадзора (.xlsm)» с зелёным бейджем «Оригинальный шаблон 262 КБ + макросы»
4. ФИС ФРДО принимает файл, потому что в нём сохранён исходный `vbaProject.bin` и метаданные

## Чего НЕ делаем

- Не делаем серверную обработку через iLovePDF/edge-функции — всё в браузере, как сейчас
- Не меняем массовый экспорт по студентам (`handleBulkExport`)
- Не добавляем шаблон ДПО — пользователь догрузит его отдельным сообщением, тогда добавим `template-dpo.xlsx`
- Не сохраняем оригинальный шаблон в БД/Storage — он лежит как ассет в репозитории

