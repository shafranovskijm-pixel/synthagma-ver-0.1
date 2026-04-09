

## Две кнопки: «Просмотр» и «Скачать PDF» для закрывающих документов

### Что будет сделано

1. **Разделение действий** — вместо одной кнопки «Download» появятся две:
   - 👁 **Просмотр** (Eye) — открывает HTML в новой вкладке (текущее поведение)
   - ⬇ **Скачать** (Download) — скачивает файл как `.html` с атрибутом `download`

2. **Логика скачивания** — новая функция `handleViewDoc` сохраняет текущее поведение (fetch → blob → window.open), а `handleDownloadDoc` будет fetch → blob → создать `<a download="...">` → click → revoke URL.

### Файлы

**`src/components/organization/tabs/DocumentsTab.tsx`**

- Переименовать текущий `handleDownloadDoc` → `handleViewDoc` (открытие в браузере)
- Новый `handleDownloadDoc`: fetch blob, создать anchor с `download` атрибутом, имя файла из `doc.name` с расширением `.html`
- В UI (строки 566-568): две кнопки — Eye и Download

**`src/components/admin/TariffsManager.tsx`**

- Аналогичное разделение на View/Download для админской панели

### UI каждого документа

```text
┌─────────────────────────────────────────────────────────┐
│ 📄 Акт № A-678253 от 09 апреля 2026          👁  ⬇   │
│    Акт · 9 апр 2026                                     │
└─────────────────────────────────────────────────────────┘
```

