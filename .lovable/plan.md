
## Plan: Fix Sidebar Brand Color + Button Animations

### Issues identified

1. **Purple icons**: The default `primaryColor` across all hooks (`useOrganization.ts`, `useBrandingSettings.ts`, `useStudentDashboard.ts`) is `#6366f1` (purple). The platform brand is Teal/Cyan. Changing the default to `#0d9488` (teal) will fix this for orgs that haven't set a custom color.

2. **btn-gradient uses wrong color**: `.btn-gradient` uses `bg-primary` which is charcoal (`0 0% 12%`), not the accent/brand color. Need to change to `bg-[hsl(var(--accent))]` so it follows the cyan theme and respects settings.

3. **No hover animation on sidebar buttons**: The sidebar buttons have `transition-all duration-200` but no visible hover effect (no scale, no brightness change). Need to add hover scale and background opacity shift.

4. **Tooltip shift without content**: The tooltip appears to cause a layout shift on hover but content isn't visible — likely a styling/z-index or timing issue with Tooltip.

### Changes

| File | What |
|------|------|
| `src/hooks/useOrganization.ts` | Change default `primaryColor` from `#6366f1` to `#0d9488` (teal) |
| `src/hooks/useBrandingSettings.ts` | Same default change |
| `src/hooks/useStudentDashboard.ts` | Same default change |
| `src/components/organization/OrgSidebar.tsx` | Add hover animation (scale + brightness) to nav buttons |
| `src/index.css` | Update `.btn-gradient` to use `--accent` color instead of `--primary`; ensure shimmer animation works |
| `src/components/organization/tabs/SettingsTab.tsx` | Update placeholder from `#6366f1` to `#0d9488` |
| `src/components/organization/LoginBrandingSettings.tsx` | Update default colors to teal |

### Sidebar hover animation detail
- Inactive buttons: `hover:scale-105 hover:brightness-110` transition
- Active button: subtle glow/shadow pulse
- Tooltip: verify it renders correctly on right side
