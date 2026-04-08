

## Перестановка секций и аккордеон для тарифов

### Что будет сделано

1. **Закрывающие документы** переносятся на самый верх вкладки (строки 510-555 → перед «Current Plan Card»).
2. Убирается условие `currentPlan !== 'free'` — документы видны всегда.
3. Всё остальное (текущий тариф, pending request, usage meters, feature highlights, сравнение тарифов) оборачивается в **Accordion** с заголовком «Тарифный план» — по умолчанию свёрнут.

### Файл: `src/components/organization/SubscriptionTab.tsx`

**Структура после изменений:**

```text
<div className="space-y-6">
  {/* 1. Закрывающие документы (бывшие строки 510-555) — всегда видны */}
  <Card> ... billing docs + кнопка «Сформировать акт» ... </Card>

  {/* 2. Тарифный план — в аккордеоне */}
  <Accordion type="single" collapsible>
    <AccordionItem value="tariff">
      <AccordionTrigger>
        <Crown /> Тарифный план — {currentPlanInfo.name}
      </AccordionTrigger>
      <AccordionContent className="space-y-6">
        {/* Current Plan Card */}
        {/* Pending Request */}
        {/* Usage Meters */}
        {/* Feature Highlights */}
        {/* Plan Comparison Grid */}
      </AccordionContent>
    </AccordionItem>
  </Accordion>

  {/* Dialogs остаются на месте */}
</div>
```

Изменения только в одном файле, чисто перестановка блоков + обёртка в Accordion.

