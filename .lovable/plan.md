

## Проблема

На странице регистрации (`RegisterOrganization.tsx`, строка 316) левая панель использует **захардкоженные** цвета градиента:

```
from-sigma-blue via-primary to-sigma-cyan
```

Эти цвета (`--sigma-blue`, `--sigma-cyan`) — фиксированные, они не меняются при смене акцентного цвета пользователя. Поэтому градиент всегда сине-голубой, независимо от выбранной темы.

## Решение

**`src/pages/RegisterOrganization.tsx`** (строка 316):
- Заменить `from-sigma-blue via-primary to-sigma-cyan` на `from-primary via-primary/80 to-accent` — это подхватит текущий акцентный цвет из CSS-переменных темы.

