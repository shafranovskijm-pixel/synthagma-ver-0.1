

## Fix: Edge Function returns raw HTML instead of rendered page

### Root Cause

The `handle-email-action` function is **not listed** in `supabase/config.toml` with `verify_jwt = false`. By default, Supabase requires a valid JWT for Edge Function calls. When a user clicks the link from an email, they have no JWT -- so the Supabase gateway intercepts the request and returns an error response, which the browser displays as raw text/source code.

### Fix

**File: `supabase/config.toml`** -- Add:

```toml
[functions.handle-email-action]
verify_jwt = false
```

Then **redeploy** the `handle-email-action` function so the new config takes effect.

After that, send a fresh test email to verify the form renders correctly in the browser.

