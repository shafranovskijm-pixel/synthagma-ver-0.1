

# Сделать боковое меню рабочим на всех страницах

## Проблема
На страницах курса (`/organization/course/:id`) и документов (`/organization/documents`) боковое меню (`OrgSidebar`) вызывает `setActiveTab()`, что меняет только внутреннее состояние контекста, но не переходит на главную страницу `/organization`. Поэтому клики по меню ни к чему не приводят.

## Решение
В `OrgSidebar` добавить проверку текущего URL. Если пользователь находится не на `/organization` (а на sub-page), при клике на пункт меню выполнять `navigate('/organization?tab=...')` вместо простого `setActiveTab()`. На главной странице дашборда `?tab=` уже обрабатывается через `useSearchParams`.

## Изменения

| Файл | Что сделать |
|---|---|
| `src/components/organization/OrgSidebar.tsx` | Добавить `useNavigate` и `useLocation`. В `handleTabClick`: если `location.pathname !== '/organization'` — вызывать `navigate('/organization?tab=...')`, иначе — `setActiveTab()` как сейчас. |

Одно изменение в одном файле, без миграций.

