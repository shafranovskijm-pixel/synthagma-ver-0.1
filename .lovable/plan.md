

## Исправления документооборота: layout, PDF, просмотр приказов и протоколов

### Проблемы

1. **Глазик посередине** — кнопки Eye и Download в закрывающих документах не обёрнуты в общий контейнер, `justify-between` растягивает их по всей ширине строки.
2. **Акт скачивается в HTML, а не PDF** — документы генерируются как HTML и скачиваются как `.html`.
3. **Приказы и протоколы без файлов** — все 41 приказ и 322 протокола имеют `file_url = null` из-за кириллицы `ПАК` в имени файла протоколов (та же ошибка Storage "Invalid key"). Просмотреть/скачать невозможно.

---

### 1. Исправление layout кнопок (закрывающие документы)

**Файл: `src/components/organization/tabs/DocumentsTab.tsx`** (строки 589-595)

Обернуть обе кнопки в `<div className="flex items-center gap-1">`:

```tsx
<div className="flex items-center gap-1">
  <Button variant="ghost" size="sm" title="Просмотр" onClick={() => handleViewDoc(doc)}>
    <Eye className="w-4 h-4" />
  </Button>
  <Button variant="ghost" size="sm" title="Скачать" onClick={() => handleDownloadDoc(doc)}>
    <Download className="w-4 h-4" />
  </Button>
</div>
```

### 2. Скачивание акта в PDF вместо HTML

**Файл: `src/components/organization/tabs/DocumentsTab.tsx`** — `handleDownloadDoc`

Использовать `window.print()` через iframe для генерации PDF:

- Fetch HTML → вставить в скрытый iframe → вызвать `iframe.contentWindow.print()` (браузер предложит «Сохранить как PDF»)
- Альтернатива: сконвертировать HTML в PDF на клиенте не получится надёжно без тяжёлых библиотек. Самый простой вариант — открыть HTML в новой вкладке с подсказкой `Ctrl+P` или использовать `print()`.

Реализация: при скачивании открывать HTML в iframe и вызывать `print()` для сохранения как PDF.

Аналогичное изменение в **`src/components/admin/TariffsManager.tsx`**.

### 3. Исправление генерации протоколов — кириллица в имени файла

**Файл: `src/utils/generateAttestationProtocol.ts`** (строка 50, 158)

- Заменить `ПАК` на `PAK` в `protocolNumber` (для имени файла Storage)
- Добавить `displayNumber` с кириллическим `ПАК` для `docName`
- Добавить `contentType: "text/html;charset=utf-8"` при upload
- Добавить логирование ошибки upload

```ts
const protocolNumber = `PAK-${Date.now().toString().slice(-6)}`;
const displayNumber = `ПАК-${protocolNumber.split("-")[1]}`;
// ...
const blob = new Blob([protocolHtml], { type: "text/html;charset=utf-8" });
const { error: uploadError } = await supabase.storage
  .from("org-documents")
  .upload(fileName, blob, { contentType: "text/html;charset=utf-8" });
if (uploadError) console.error("Storage upload error:", uploadError);
```

### 4. Исправление генерации приказов — добавить contentType

**Файл: `src/utils/generateEnrollmentOrder.ts`** (строка 102, 105-107)

Добавить `contentType: "text/html;charset=utf-8"` при upload (сейчас отсутствует):

```ts
const blob = new Blob([orderHtml], { type: "text/html;charset=utf-8" });
await supabase.storage.from("org-documents").upload(fileName, blob, { contentType: "text/html;charset=utf-8" });
```

### 5. Просмотр/скачивание через Blob для приказов и протоколов

**Файл: `src/components/organization/DocumentArchiveView.tsx`** (строки 223-245)

Заменить `window.open(doc.file_url)` на fetch → Blob → `window.open(blobUrl)` (как в закрывающих), и добавить скачивание через print().

**Файл: `src/components/organization/OrdersArchive.tsx`** (строки 230-254)

Аналогичная замена: просмотр через Blob, скачивание через print-диалог.

---

### Итог

| Что | Статус после |
|-----|-------------|
| Кнопки глазик/скачать — layout | Рядом справа |
| Скачивание акта | Через print → PDF |
| Новые протоколы | Файл сохраняется, можно просмотреть/скачать |
| Новые приказы | Файл с правильным contentType |
| Старые 322 протокола + 41 приказ | Без файла (данные для регенерации не сохранены) |

