

## Fix: Duplicate Telegram Notifications on Organization Registration

### Root Cause

The `safeInvoke` utility has built-in retry logic (up to 3 attempts with delays of 0s, 2s, 5s). When the Telegram notification call encounters a transient network issue or gets flagged by security software detection, `safeInvoke` retries — but the Telegram API already processed the first request successfully. Each retry sends a new, independent Telegram message, resulting in 2-3 duplicate notifications.

This is a non-idempotent side effect (sending a message) wrapped in a retry mechanism designed for idempotent reads — a classic bug.

### Fix

**File: `src/pages/RegisterOrganization.tsx`** (line ~279)

Replace `safeInvoke` with a direct `supabase.functions.invoke()` call (no retries) for the Telegram notification. This is a fire-and-forget notification — if it fails once, we should not retry and risk duplicates.

```typescript
// Instead of:
await safeInvoke("send-telegram-notification", {
  body: { message: telegramMessage },
});

// Use direct invoke (no retry):
await supabase.functions.invoke("send-telegram-notification", {
  body: { message: telegramMessage },
});
```

Additionally, audit the other two places that send Telegram notifications via `safeInvoke` and apply the same fix:
- `src/components/organization/SubscriptionTab.tsx` (line ~169)
- `src/components/onboarding/SupportRequestForm.tsx` (line ~143)

### Why not fix safeInvoke itself?

`safeInvoke` is used across many other calls (student registration, course import, password reset) where retries ARE appropriate. The fix should be targeted: only Telegram notifications should skip retries since they are non-idempotent side effects.

