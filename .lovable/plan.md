

# Убираем визуальные артефакты (линии/засветы) в сайдбарах

## Проблема

Во всех трех сайдбарах (Admin, Organization, Student) есть `border border-border/60` на pill-контейнере навигации и `border-r border-border/60` на самом aside. При полупрозрачных фонах и `backdrop-blur-sm` эти бордеры выглядят как «засветы» / недоработанные линии.

## Решение

Убрать бордеры и заменить на мягкие тени для глубины:

1. **Pill-контейнер** (`rounded-[28px]`): убрать `border border-border/60`, оставить только `shadow-sm` или заменить на `shadow-md` для мягкой глубины
2. **Aside**: убрать `border-r border-border/60`, добавить `shadow-lg` справа для мягкого разделения
3. **Лого-контейнер**: убрать `border border-border/60`, оставить `shadow-sm`
4. **Кнопки навигации**: без изменений (бордеров нет)

Одинаковые правки во всех 3 файлах для консистентности.

## Файлы

| Действие | Файл |
|---|---|
| Изменить | `src/components/admin/AdminSidebar.tsx` |
| Изменить | `src/components/organization/OrgSidebar.tsx` |
| Изменить | `src/components/student/StudentSidebar.tsx` |

## Конкретные изменения

В каждом файле:
- `aside`: `border-r border-border/60` → `shadow-[2px_0_8px_rgba(0,0,0,0.06)]`
- pill `div`: `border border-border/60` → убрать (оставить `shadow-sm`)
- logo `div`: `border border-border/60` → убрать (оставить `shadow-sm`)

