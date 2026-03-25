

## Исправить вход студентов с брендированной страницы

### Проблема
В RPC `public_lookup_user_by_login` сравнение логина **регистрозависимое** (`WHERE p.login = login_input`). В базе у многих студентов логин хранится с заглавной буквы (например `Sgt104680`), а код на клиенте приводит ввод к нижнему регистру (`sgt104680`). Результат: поиск не находит профиль → ошибка «Неверный логин или пароль».

На обычной странице входа (Login.tsx) по умолчанию открыта вкладка «email», поэтому студенты входят по email и проблема не проявляется. На брендированной странице (BrandedLogin.tsx) по умолчанию вкладка «По логину» — и тут ломается.

### Решение

**1. Миграция: сделать поиск регистронезависимым**

```sql
CREATE OR REPLACE FUNCTION public.public_lookup_user_by_login(login_input TEXT)
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.user_id
  FROM profiles p
  WHERE LOWER(p.login) = LOWER(login_input)
  LIMIT 1;
END;
$$;
```

Это единственное необходимое изменение — клиентский код уже корректно формирует `{login}@student.local` в нижнем регистре, что совпадает с auth email (тоже в нижнем регистре).

### Файлы
| Файл | Изменение |
|------|-----------|
| SQL-миграция | `LOWER(p.login) = LOWER(login_input)` в RPC |

Изменений в клиентском коде не требуется.

