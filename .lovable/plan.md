

## Plan: Add FAQ section, agreement checkbox, and promo materials downloads

### Changes to `src/pages/PartnerLanding.tsx`

1. **Agreement checkbox before "Стать партнёром"**
   - Add `agreedToTerms` state (boolean, default false)
   - In both hero and CTA sections, show a checkbox with label: "Я согласен с [условиями партнёрской программы](/partner/offer)" (link opens offer page)
   - Disable the "Стать партнёром" button when checkbox is unchecked
   - Only show checkbox when user is NOT already a partner

2. **FAQ section** (before CTA, after promo materials)
   - Add an accordion-style FAQ section with teal-branded question icons
   - Questions adapted for СИНТАГМА:
     - Как подключиться к партнёрской программе и начать зарабатывать?
     - Кто может участвовать в партнёрской программе?
     - Как отслеживаются регистрации и оплаты рефералов?
     - Каким образом происходят выплаты комиссии?
     - Можно ли заключить договор?
     - Как организована отчётность по выплатам?

3. **Official promo materials for download** (add to promo section)
   - Add a "Дополнительно" subsection below the text templates
   - List downloadable files with PDF/ZIP badges and download icons (styled like SkillSpace screenshot)
   - Files: "Возможности и тарифы СИНТАГМА (для организаций).pdf", "Возможности и тарифы СИНТАГМА (для онлайн-школ).pdf", "Рекламные баннеры СИНТАГМА.zip"
   - These will be placeholder links (pointing to `#`) until actual files are uploaded to storage

### Files modified
| File | What |
|------|------|
| `src/pages/PartnerLanding.tsx` | Add `agreedToTerms` state + checkbox, FAQ accordion section, downloadable promo materials list |

### No database changes needed

