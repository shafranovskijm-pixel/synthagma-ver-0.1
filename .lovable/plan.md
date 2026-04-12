

## Plan: Fix consent/documents visibility, referral links, partner page improvements

### Issues identified

1. **Consent & Documents show "no org" fallback** — The tabs require `organization_id` but the current user doesn't have one. Need to show content even without organization (consent form can work standalone, documents list can show required docs).

2. **No badge notifications on tabs** — Need notification badges (counts) on Consent (1) and Documents (3) tabs showing pending items.

3. **Referral link shows lovableproject.com** — `PartnerLanding.tsx` and `PartnerDashboard.tsx` use `window.location.origin` instead of `getBaseUrl()` which returns `sintagma.com.ru` in production.

4. **Partner landing needs promo materials section** — Add "Кому рекомендовать", "Как заработать максимум" sections with copyable text templates (for messenger + social posts), similar to SkillSpace reference screenshots.

5. **Partner program tied to user or organization** — Currently tied only to user. Need to also support organization-level partnership.

### Changes

| File | What |
|------|------|
| `src/pages/StudentProfile.tsx` | Remove org requirement for consent/documents tabs — pass `organizationId` as optional. Add badge counts on tab triggers (1 for consent if not submitted, count for documents needing upload). |
| `src/components/student/StudentConsentForm.tsx` | Make `organizationId` optional — show standalone consent form even without org. |
| `src/components/student/StudentDocumentsUpload.tsx` | Make `organizationId` optional — show required document checklist even without org. |
| `src/pages/PartnerLanding.tsx` | Replace `window.location.origin` with `getBaseUrl()` for referral links. Add promo materials section: "Кому рекомендовать" cards, "Как заработать максимум" with copyable text templates for messengers and social posts (adapted from SkillSpace but with СИНТАГМА branding). |
| `src/pages/PartnerDashboard.tsx` | Replace `window.location.origin` with `getBaseUrl()` for referral link. Add promo text templates adapted for СИНТАГМА (messenger text, social post text with copy buttons). |
| `src/utils/getBaseUrl.ts` | Already correct, no changes needed. |

### Promo materials content

**Messenger text template:**
> Я использую платформу СИНТАГМА для дистанционного обучения — современная LMS с документооборотом, ФРДО, видеоидентификацией и ИИ. Попробуйте бесплатно: [ссылка]

**Social post template:**
> Для обучения сотрудников использую СИНТАГМА — платформу с полным функционалом: курсы, тесты, документооборот, охрана труда, ФРДО. Преимущества: бесплатный старт, безлимит учеников, ИИ-генерация курсов, онлайн-касса. Попробуйте: [ссылка]

### Badge logic
- Consent tab: show badge "1" if user has no accepted consent record
- Documents tab: show badge with count of required but not-yet-uploaded document types (e.g. passport, СНИЛС, diploma = 3 by default)

