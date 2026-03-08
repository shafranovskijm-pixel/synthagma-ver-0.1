

## SEO для страницы Ростехнадзора

### Что делаем
Добавляем `Helmet` с полным набором мета-тегов на страницу `/rostechnadzor-courses` + обновляем `sitemap.xml`.

### Изменения

**`src/pages/RostechnadzorCoursesPage.tsx`** — добавить импорт `Helmet` и блок мета-тегов:
- `<title>` — «Курсы Ростехнадзора 2026 — 200+ программ с актуальными тестами | СИНТАГМА»
- `description` — продающий текст про готовые курсы, актуальные тесты, промбезопасность, электробезопасность
- Open Graph теги: `og:title`, `og:description`, `og:type`, `og:url`, `og:image`
- JSON-LD structured data (Course catalog / ItemList)

**`public/sitemap.xml`** — добавить URL `/rostechnadzor-courses`

