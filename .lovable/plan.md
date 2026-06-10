## Что добавим

В каталог тем для админа/организации добавлю новую тему **«Синтагма» (оригинальный циан)** — точно тот фирменный teal/cyan HSL `174 72% 46%`, который зафиксирован в memory как основной цвет платформы. Существующая «Бирюза» (170 80% 50%) слишком яркая, «Океан» — синий; новой темы с фирменным циан-аксентом в каталоге нет.

## Файл

`src/constants/admin-themes.ts` — добавлю новый объект в массив `ADMIN_THEMES` в группе `water` (первой в группе, чтобы её было легко найти):

```ts
{
  id: "sintagma-cyan",
  label: "Синтагма (оригинал)",
  emoji: "Σ",
  group: "water",
  bannerUrl: "<спокойный teal/cyan баннер с unsplash>",
  bgClass: "bg-gradient-to-b from-teal-50/70 via-cyan-50/30 to-white",
  headerClass: "bg-gradient-to-r from-teal-100/70 to-cyan-50/50",
  cardClass: "border-teal-200/50 bg-white/90",
  sidebarClass: "bg-gradient-to-b from-teal-50/80 to-cyan-50/60",
  accent: "174 72% 46%",         // фирменный цвет платформы
  accentForeground: "0 0% 100%",
  animation: "particles",
  forceLight: true,
  bannerPosition: "center 45%",
  previewPosition: "center 45%",
  atmosphereSharp: true,
  atmosphereOpacity: 0.3,
}
```

## Как пользователь выберет

В кабинете → Настройки темы → группа **«Вода» 🔵** → «Синтагма (оригинал)». Никакие другие темы и компоненты не меняем — только добавляем новую запись в список.

## Что не делаем

- Не трогаем существующие темы (Бирюза/Океан остаются).
- Не меняем код выбора/применения темы (`useOrgTheme`, ThemeSelector и т.п.) — они автоматически подхватят новую запись.
- Не меняем глобальный CSS / index.css — тема накладывает свой accent через существующий механизм.
