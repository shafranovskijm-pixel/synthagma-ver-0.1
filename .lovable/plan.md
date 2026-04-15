

# Брендированный загрузчик — логотип Σ вместо кругляшка

## Что будет сделано

Создаём компонент `SigmaSpinner` — квадратная иконка с Σ (как в логотипе, с острыми углами `rounded-lg`), которая плавно вращается. Затем заменяем все `Loader2 className="... animate-spin text-primary"` на этот компонент по всему проекту.

## Технические детали

### 1. Новый компонент `src/components/ui/SigmaSpinner.tsx`

- Квадрат с `rounded-lg` (как в `SigmaLogo`), внутри символ Σ
- CSS-анимация: плавное вращение (`animate-spin`) или пульсация + вращение для более интересного эффекта
- Пропсы `size` (sm/md/lg) и `className` для гибкости
- Цвета: фон `bg-primary`, текст `text-primary-foreground` (Teal/Cyan стиль)

### 2. Глобальная замена Loader2 → SigmaSpinner

Заменить паттерн `<Loader2 className="w-6 h-6 animate-spin text-primary" />` (и аналогичные w-8 h-8) на `<SigmaSpinner />` во всех ~106 файлах. Также обновить `LazyLoadFallback.tsx`.

Исключения: кнопки, где Loader2 стоит рядом с текстом (например «Обработка...») — там оставить маленький SigmaSpinner size="sm".

### 3. Анимация

Два варианта эффекта (оба с острыми углами):
- **Вращение**: квадрат с Σ плавно крутится (как сейчас Loader2, но квадратный)
- **Отрисовка**: SVG stroke-dashoffset анимация, буква Σ «вырисовывается»

Реализую вращение как основной вариант — оно проще и узнаваемее в контексте загрузки.

## Файлы

| Файл | Действие |
|---|---|
| `src/components/ui/SigmaSpinner.tsx` | Новый компонент — брендированный спиннер |
| ~106 файлов с `Loader2 animate-spin` | Замена на `SigmaSpinner` |
| `src/components/LazyLoadFallback.tsx` | Добавить SigmaSpinner вместо Progress bar |

