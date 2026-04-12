

# Plan: Course Landing Page System with Settings

## Summary
Create a full course landing page system similar to SkillSpace, where each course gets its own public page with a unique slug URL. Add a settings dialog in the CourseEditor with 4 tabs: Page Settings, Enrollment Form, Promo Codes, and Analytics.

## Database Changes

1. **Add columns to `courses` table:**
   - `slug` (text, unique, nullable) — human-readable URL identifier
   - `accent_color` (text, nullable) — accent color for the landing page

2. **Create `course_promo_codes` table** (per-course promo codes, separate from global `promo_codes`):
   - `id` (uuid, PK)
   - `course_id` (uuid, FK -> courses)
   - `code` (text)
   - `discount_value` (integer) — discount amount
   - `discount_type` (text, default 'percent') — 'percent' or 'fixed'
   - `is_active` (boolean, default true)
   - `max_uses` (integer, nullable)
   - `used_count` (integer, default 0)
   - `valid_until` (timestamptz, nullable)
   - `created_at` (timestamptz)
   - RLS: organization members can manage their course promo codes

3. **Use existing `landing_content` JSONB** on courses to store:
   - `enrollment_form` — form fields config, subtitle text
   - `analytics` — yandex_metrika_id, yandex_goal_id, ga_tracking_id, ga_event_name, meta_pixel_id
   - `blocks` — custom content blocks (already supported)
   - `external_url` — redirect URL (already supported)

## New Components

1. **`CoursePageSettingsDialog`** — Modal with 4 tabs (accessed from CourseEditor toolbar via gear icon):
   - **Tab "Страница курса"**: slug editor with copy-link button, accent color picker
   - **Tab "Форма записи"**: enrollment form preview/config (subtitle, custom fields)
   - **Tab "Промокоды"**: CRUD for course-specific promo codes with table
   - **Tab "Аналитика"**: Yandex Metrika, Google Analytics, Meta Pixel fields

2. **Enhanced `CourseLanding.tsx`**: 
   - Support slug-based routing (`/c/:slug`)
   - Apply accent color from course settings
   - Render enrollment form with custom fields
   - Inject analytics scripts (Yandex Metrika, GA, Meta Pixel) dynamically
   - Support promo code input on enrollment form

## Routing

- Add route `/c/:slug` that resolves slug -> courseId and renders CourseLanding
- Keep existing `/course/:courseId/landing` route as fallback

## Files to Create/Edit

- **Create**: `src/components/course-editor/CoursePageSettingsDialog.tsx`
- **Edit**: `src/pages/CourseEditor.tsx` — add settings gear icon button to open dialog
- **Edit**: `src/pages/CourseLanding.tsx` — support slug routing, accent color, analytics, enrollment form, promo codes
- **Edit**: `src/App.tsx` — add `/c/:slug` route
- **Migration**: add `slug`, `accent_color` columns; create `course_promo_codes` table with RLS

## Technical Details

- Slug auto-generated from course title (transliterated) but editable
- Accent color applied via CSS custom properties on the landing page
- Analytics scripts injected via `useEffect` with `document.head.appendChild`
- Promo code validation checks `course_promo_codes` table at enrollment time and adjusts displayed price

