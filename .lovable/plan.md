

## Добавить FloatingParticles в остальные секции

### Проблема
Сейчас `FloatingParticles` есть только в Hero, EditorDemo и Features. Секции PricingPlans, RostechnadzorCourses, Testimonials и MobileApp выглядят пустыми — нет живых интерактивных элементов.

### Решение
Добавить `<FloatingParticles />` в оставшиеся 4 секции:

| Секция | mode | count | Почему |
|---|---|---|---|
| `PricingPlans.tsx` | `dots` | 10 | Не отвлекать от таблицы тарифов |
| `RostechnadzorCourses.tsx` | `mixed` | 8 | Смешанный — иконки + точки для разнообразия |
| `Testimonials.tsx` | `dots` | 8 | Деликатные точки, не перегружать отзывы |
| `MobileApp.tsx` | `mixed` | 10 | Полноценный набор как в Features |

### Файлы
- `src/components/landing/PricingPlans.tsx` — добавить import + `<FloatingParticles mode="dots" count={10} />`
- `src/components/landing/RostechnadzorCourses.tsx` — добавить import + `<FloatingParticles mode="mixed" count={8} />`
- `src/components/landing/Testimonials.tsx` — добавить import + `<FloatingParticles mode="dots" count={8} />`
- `src/components/landing/MobileApp.tsx` — добавить import + `<FloatingParticles mode="mixed" count={10} />`

