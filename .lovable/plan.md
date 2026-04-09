

## Исправление отображения акта при скачивании

### Проблема

Две причины:
1. **Кодировка**: Blob создаётся без указания `charset=utf-8`, Supabase Storage отдаёт файл без правильного Content-Type → кириллица превращается в кракозябры.
2. **Отображение**: Браузер показывает сырой HTML-код вместо отрендеренной страницы, потому что Storage отдаёт `Content-Disposition: attachment` или неверный MIME-тип.

### Исправление

#### 1. `src/utils/generateAct.ts` — правильная кодировка при загрузке

- Указать `contentType` явно при upload:
```ts
const blob = new Blob([html], { type: "text/html;charset=utf-8" });

await supabase.storage
  .from("billing-documents")
  .upload(fileName, blob, { contentType: "text/html;charset=utf-8" });
```

#### 2. `src/components/organization/tabs/DocumentsTab.tsx` — скачивание через Blob URL

Вместо `window.open(url)` — fetch HTML, создать локальный Blob и открыть:

```ts
const handleDownloadDoc = async (doc: BillingDoc) => {
  const url = await getSignedStorageUrl("billing-documents", doc.file_url);
  if (!url) { toast({...}); return; }
  
  const res = await fetch(url);
  const text = await res.text();
  const blob = new Blob([text], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, "_blank");
};
```

Это гарантирует, что браузер отрендерит HTML с правильной кодировкой.

