

## Plan: Actualize Rostechnadzor Courses Page with Real Data

### Problem
The page shows hardcoded "200+ courses" in 6 categories (Промбезопасность, Электробезопасность, Энергетика, Экология, ГТС, Стройконтроль). Real database has **303 courses** across **14 categories** with very different distribution:

| Category | Real count |
|----------|-----------|
| Электробезопасность | 121 |
| Энергетика | 64 |
| Рабочие профессии | 21 |
| Медицина | 20 |
| Охрана труда | 18 |
| Пожарная безопасность | 14 |
| Строительные специальности | 10 |
| Слесари | 8 |
| Промышленная безопасность | 8 |
| Разное | 7 |
| Машинист | 5 |
| Экологическая безопасность | 3 |
| Строительный контроль | 2 |
| Профессиональная переподготовка | 2 |

### Solution

**1. Update both components with real numbers and categories:**

- **`RostechnadzorCourses.tsx`** (landing section): Change "200+" to "300+", update highlights to reflect broader scope (not just Ростехнадзор — also Охрана труда, Пожарная безопасность, Медицина, Рабочие профессии)

- **`RostechnadzorCoursesPage.tsx`** (full page): Replace hardcoded 6 categories with all 14 real categories, correct course counts, add representative course titles from actual database. Update page title/SEO meta to "300+ готовых курсов" and broaden messaging — the page is not just Ростехнадзор anymore, it is a full library of ready-made courses for organizations.

**2. Reframe the value proposition:**
- Title: "300+ готовых курсов для обучения сотрудников"
- Subtitle: Focus on "ready-made courses your clients need, no development required"
- Keep Ростехнадзор as the strongest category but present the full picture

**3. Enhanced category cards** with actual course names from DB, correct counts, appropriate icons and colors for new categories (Медицина, Охрана труда, Пожарная безопасность, Рабочие профессии, Слесари, Машинист, etc.)

**4. Visual consistency** — add FloatingParticles, dark hero section, glassmorphism cards to match partner landing quality

**5. Update JSON-LD** structured data with all 14 categories

### Files modified
| File | What |
|------|------|
| `src/components/landing/RostechnadzorCourses.tsx` | Update stats (300+), broaden messaging beyond just Ростехнадзор |
| `src/pages/RostechnadzorCoursesPage.tsx` | Replace 6 hardcoded categories with 14 real ones, update SEO, reframe value prop, visual upgrade |

### No database changes needed

