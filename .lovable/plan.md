

## Plan: Companies Page Layout + Button Styling

### Changes

**1. Move stats widgets below the onboarding card (`CompaniesManager.tsx`)**
- Currently the order is: Header → Stats Grid → Search → Companies/Onboarding card
- New order: Header → Search → Onboarding card (when no companies) → Stats Grid → Companies list
- When there ARE companies: Header → Search → Stats Grid → Companies list
- This way stats appear after the onboarding banner but search stays at the top

**2. Button color: use accent/primary instead of foreground (`index.css`)**
- Change `.btn-gradient` from `bg-foreground text-background` to `bg-primary text-primary-foreground`
- This makes buttons use the cyan accent color by default
- Since ThemePersonalization already lets users change `--accent`, and primary maps to the theme color, buttons will follow the configured color

**3. Add button animations (`index.css` + `button.tsx`)**
- Add hover scale + shadow transition to `.btn-gradient`: `transition-all duration-200 hover:scale-[1.02] hover:shadow-lg`
- Add subtle press effect: `active:scale-[0.98]`
- Add a shimmer/shine effect on hover using a CSS pseudo-element gradient sweep

### Files modified
| File | What |
|------|------|
| `src/components/organization/CompaniesManager.tsx` | Reorder: search first, then onboarding/stats |
| `src/index.css` | Update `.btn-gradient` color to primary + add animations |

