

## Убрать многоточие — вынести кнопки напрямую

Сейчас в строке организации есть кнопка «Просмотр» + меню ⋯ (DropdownMenu) с пунктами: «Войти как», «Редактировать», «Удалить». Заменим на 3 отдельные кнопки в ряд.

### Изменения

**Файл: `src/components/admin/OrganizationsManager.tsx`**

**1. Табличный вид (строки 830-855):**
Заменить `DropdownMenu` на три кнопки:
- «Войти как» — `variant="outline"`, `size="sm"`, иконка `ExternalLink`
- «Редактировать» — `variant="ghost"`, `size="icon"`, иконка `Pencil`
- «Удалить» — `variant="ghost"`, `size="icon"`, иконка `Trash2`, класс `text-destructive`

**2. Карточный вид (строки 1024-1051):**
Аналогичная замена — убрать `DropdownMenu`, вынести кнопки в ряд.

Итого: два блока правок в одном файле, удаление `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuSeparator`/`MoreHorizontal` из импортов (если больше нигде не используются).

