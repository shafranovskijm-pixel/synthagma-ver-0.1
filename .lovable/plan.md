

## Plan: Generate Real Downloadable Promo Materials

### Problem
The download links for promo materials are placeholders (`href="#"`). The user wants actual downloadable files.

### Approach
Generate the 3 files programmatically and place them in `public/promo/` so they're directly downloadable without needing storage setup:

1. **PDF "Возможности и тарифы СИНТАГМА (для организаций)"** — Generated via a script using `jsPDF` or HTML-to-PDF. Content: platform overview for organizations (corporate training, safety training, document management, FRDO), tariff comparison table with all 5 plans, key features list.

2. **PDF "Возможности и тарифы СИНТАГМА (для онлайн-школ)"** — Similar but targeted at online schools (course creation, AI generation, student cabinet, branding, webinars).

3. **ZIP "Рекламные баннеры СИНТАГМА"** — Generate banner images (SVG converted to PNG) in standard ad sizes (728x90, 300x250, 160x600, 1200x628) with teal branding, platform name, and tagline. Bundle into ZIP.

All files go to `public/promo/` and the download links in `PartnerLanding.tsx` update from `href="#"` to `/promo/filename`.

### Files modified
| File | What |
|------|------|
| `public/promo/*.pdf` | Two generated PDF brochures |
| `public/promo/banners.zip` | ZIP with banner images |
| `src/pages/PartnerLanding.tsx` | Update `href="#"` to actual `/promo/` paths |

### Generation approach
- Use Python with `reportlab` for PDF generation (professional layout with tables, colors, headers)
- Use Python `Pillow` for banner image generation
- Copy outputs to `public/promo/`

