

## Plan: Redesign Special Offer Popup + Add Telegram Notification

### Problem
1. Popup is small (400px) and plain — no imagery, minimal visual impact
2. No Telegram notification on submission — only saves to `plan_requests` table

### Changes to `src/components/landing/SpecialOfferPopup.tsx`

**1. Visual upgrade:**
- Widen to ~520px with a left image panel + right form panel layout (side-by-side on desktop, stacked on mobile)
- Generate a promotional image via AI (gift/discount theme in teal brand colors) and place in `src/assets/`
- Left panel: full-height image with gradient overlay, headline text on top
- Right panel: form with richer styling — larger inputs, gradient CTA button matching brand teal
- Add subtle animated sparkle/glow effects around the discount badge
- Rounded-3xl corners, stronger shadow, gradient border accent

**2. Add Telegram notification after successful insert:**
```typescript
// After plan_requests insert succeeds:
await supabase.functions.invoke("send-telegram-notification", {
  body: {
    message: `🎁 <b>Заявка со спецпредложения</b>\n\n<b>Имя:</b> ${name.trim()}\n<b>Телефон:</b> ${phone.trim()}\n<b>Источник:</b> Попап "Специальные условия"`,
  },
});
```
- Non-blocking (wrapped in try/catch) per existing project pattern
- Uses the existing `send-telegram-notification` edge function with `TELEGRAM_SUPPORT_CHAT_ID`

### Files modified
| File | What |
|------|------|
| `src/components/landing/SpecialOfferPopup.tsx` | Redesign layout + add Telegram call |
| `src/assets/special-offer-bg.png` | AI-generated promo image |

### No database changes needed

