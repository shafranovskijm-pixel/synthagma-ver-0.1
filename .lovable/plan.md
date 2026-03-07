

## Перенос «Центра документов» в раздел «Документы»

### Что делаем

Переносим весь блок «Центр документов» из Настроек в раздел Документы. В DocumentsTab добавляется новый подраздел «Конструктор», объединяющий все шаблонные инструменты. Из SettingsTab этот блок удаляется.

### Изменения

**1. `src/components/organization/tabs/DocumentsTab.tsx`**

- Добавить новый подтаб `"constructor"` в начало списка табов (иконка `Settings` или `Wrench`, лейбл «Конструктор»).
- Внутри этого подтаба отрисовать табы из Центра документов (Реквизиты, Договор, Протокол АК, Удост./Диплом, Согласие ПД, Печать) — по сути переносим JSX из SettingsTab (строки 198-301).
- Импортировать: `OrgRequisitesForm`, `ContractTemplateEditor` → кнопка «Открыть конструктор» (navigate к `/contract-editor`), `ProtocolTemplateEditor`, `CertificateTemplateEditor`, `ConsentGenerator`, `StampSignatureUploader`.
- Добавить пропс `organizationName` (нужен для `ConsentGenerator`).
- Добавить логику загрузки stamp/signature URLs (как в SettingsTab, строки 42-75).
- Обернуть в `LockedOverlay` для бесплатного тарифа — пробросить `plan` через пропсы или `useSubscriptionLimits`.

**2. `src/components/organization/tabs/SettingsTab.tsx`**

- Удалить блок `<details>` «Центр документов» (строки 182-303).
- Удалить неиспользуемые импорты: `ContractTemplateEditor`, `ConsentGenerator`, `ProtocolTemplateEditor`, `CertificateTemplateEditor`, `StampSignatureUploader`, `OrgRequisitesForm`, `Stamp`, `Award`, `GraduationCap`, `UserCheck`, `ScrollText` и прочие.
- Удалить state `docTab`, `stampUrl`, `signatureUrl` и обработчики stamp/signature upload/remove.

**3. Обновление пропсов**

В месте рендеринга `DocumentsTab` (скорее всего `TabContentRenderer.tsx`) пробросить `organizationName` — получить из `useOrgDashboard`.

### Структура подтабов в Документах (итоговая)

```text
[Конструктор] [Орг.] [Приказы] [Протоколы] [Удост.] [Дипломы] [Свид.] [Программы]
     │
     └─ Внутренние табы:
        Реквизиты | Договор | Протокол АК | Удост./Диплом | Согласие ПД | Печать
```

