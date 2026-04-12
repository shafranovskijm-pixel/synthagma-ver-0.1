

## Plan: Premium Redesign of Partner Landing Page

### Problem
The partner landing page lacks the visual richness of the main landing page. Missing: `FloatingParticles`, dot patterns, decorative vertical lines, deep layered gradients, `section-padding` consistency, rich card glassmorphism. The page feels flat compared to the main site.

### Changes to `src/pages/PartnerLanding.tsx`

1. **Add FloatingParticles** to Hero, Benefits, Promo, and CTA sections (imported from `@/components/landing/FloatingParticles`)

2. **Hero section overhaul**:
   - Add dark teal gradient background (`bg-foreground` like main CTA) with radial glows
   - Add dot pattern overlay (`radial-gradient` like main CTA)
   - Add decorative vertical lines (animated `scaleY` like main landing)
   - Add corner border decorations (animated fade-in)
   - Make text white/light on dark background for contrast
   - Increase padding to match main landing sections

3. **Section backgrounds**: Add alternating gradient backgrounds matching main landing style — `from-secondary/30 via-background to-secondary/30` for "How it works", subtle teal mesh for Benefits, etc.

4. **Commission tiers**: Add glassmorphism cards with backdrop-blur, richer teal gradients, and hover glow effects

5. **Promo materials section**: Add dark background section (like main CTA) with dot pattern, making cards glow with glassmorphism borders

6. **FAQ section**: Add subtle background gradient, decorative elements

7. **CTA section**: Full dark background (`bg-foreground`) with radial teal glows, dot pattern, decorative corner borders — matching the main landing's CTA section exactly

8. **General**: Use `section-padding` class for consistent spacing, add decorative vertical accent lines between sections

### Files modified
| File | What |
|------|------|
| `src/pages/PartnerLanding.tsx` | Full visual upgrade with FloatingParticles, dark sections, glassmorphism, dot patterns, decorative lines, and rich gradients matching main landing quality |

### No database changes needed

