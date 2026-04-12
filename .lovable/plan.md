

## Plan: Redesign Partner Landing Page with Cyan Branding

### Problem
The partner landing uses `primary` color (dark charcoal `0 0% 12%`) for gradients, icons, badges — resulting in a gray/black look instead of the brand cyan/teal. The page looks bland and lacks visual impact.

### Solution
Redesign `PartnerLanding.tsx` with explicit teal/cyan colors (`hsl(174, 72%, 46%)` / Tailwind `teal-500`) throughout, plus richer visual design:

### Changes to `src/pages/PartnerLanding.tsx`

1. **Hero section**: Replace `bg-primary/X` gradients with `bg-teal-500/X` and `bg-cyan-500/X`. Add a large decorative gradient mesh background in teal. Make the CTA button use `bg-teal-500 hover:bg-teal-600` with glow effect.

2. **Floating decorative elements**: Change borders/backgrounds from `primary/15` to `teal-500/20`, `cyan-400/15` etc. Add more animated geometric shapes with teal tones.

3. **Cards and icons**: Replace all `bg-primary/10`, `text-primary` with `bg-teal-500/10`, `text-teal-600`. Commission tier gradients use teal scale.

4. **Commission tiers**: Use `from-teal-500/10 to-teal-500/5` gradient scale with increasing intensity. Percentage text in `text-teal-600`.

5. **Promo materials section**: Expand with 3 cards instead of 2:
   - Messenger text (existing, restyled)
   - Social post text (existing, restyled)  
   - Email/commercial proposal text (new — for B2B pitch to organizations)
   
   Add teal accent borders and icon backgrounds.

6. **"Who to recommend" section**: Replace emoji icons with styled teal icon boxes using Lucide icons.

7. **CTA section**: Full teal gradient background (`from-teal-500/10 via-teal-600/15 to-cyan-500/10`) with decorative elements.

8. **Overall**: Add subtle animated teal gradient orbs, mesh patterns, and glassmorphism cards with teal-tinted borders for a premium feel.

### Files modified
| File | What |
|------|------|
| `src/pages/PartnerLanding.tsx` | Full visual redesign with teal/cyan palette, enhanced promo materials, richer animations and decorative elements |

### No database changes needed

