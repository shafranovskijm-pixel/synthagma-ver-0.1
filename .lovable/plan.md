

## Добавить предпросмотр документа во вкладку «Печать»

Во вкладке «Печать» (`stamp` tab) нет аккордеона с предпросмотром, хотя он был добавлен в остальные вкладки конструктора. Нужно добавить аналогичный аккордеон «Предпросмотр документа» после загрузчиков печати/подписи.

### Изменения

**`src/components/organization/tabs/DocumentsTab.tsx`**

- Импортировать `Accordion, AccordionContent, AccordionItem, AccordionTrigger` и `Eye` из lucide-react, а также `DocumentPreview`
- После `<div className="grid ...">` с двумя `StampSignatureUploader` (строка ~272), добавить аккордеон:

```tsx
<Accordion type="single" collapsible>
  <AccordionItem value="preview" className="border rounded-xl px-4">
    <AccordionTrigger className="text-sm hover:no-underline gap-2">
      <span className="flex items-center gap-2">
        <Eye className="w-4 h-4" />
        Предпросмотр документа
      </span>
    </AccordionTrigger>
    <AccordionContent>
      <DocumentPreview type="certificate" data={{}} />
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

Покажет пример удостоверения с дефолтными данными, чтобы пользователь видел, как печать/подпись будут выглядеть на документе.

