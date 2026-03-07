

## Проблема

`LockedOverlay` использует `absolute inset-0` внутри `<details>`, перекрывая кнопку `<summary>` (заголовок). После открытия секции оверлей блокирует клик по заголовку и секцию невозможно закрыть.

## Решение

Переместить `LockedOverlay` так, чтобы он не перекрывал `<summary>`. Вместо размещения оверлея внутри `<details>` на уровне всего блока — применить его только к контенту внутри `<details>` (после `<summary>`), обернув контент в `div.relative`.

### Изменения

**Файл:** `src/components/organization/tabs/SettingsTab.tsx`

Для каждого `<details>` с `LockedOverlay` (~6 мест):
- Убрать `LockedOverlay` из начала `<details>` (перед `<summary>`)
- Обернуть содержимое после `<summary>` в `<div className="relative">` и поместить `LockedOverlay` внутрь этой обёртки

Пример текущего кода:
```tsx
<details className="... relative">
  {isFreePlan && <LockedOverlay ... />}
  <summary>Заголовок</summary>
  {/* контент */}
</details>
```

Станет:
```tsx
<details className="...">
  <summary>Заголовок</summary>
  <div className="relative">
    {isFreePlan && <LockedOverlay ... />}
    {/* контент */}
  </div>
</details>
```

Это позволит `<summary>` всегда оставаться кликабельным, а оверлей будет перекрывать только содержимое секции.

