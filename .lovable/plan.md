
# Fix: Direct navigation to /student shows content correctly

## Problem
When a student navigates directly to `/student` (e.g., from a bookmark or custom domain), the page may not load because of a race condition in the authentication logic:

1. `getSession()` resolves and finds an active session
2. `setLoading(false)` is called **immediately**
3. `fetchUserRole()` is called but has NOT finished yet
4. `ProtectedRoute` renders with `user` set but `userRole` still `null`
5. The component shows a perpetual loading spinner or redirects incorrectly

## Root Cause
In `src/hooks/useAuth.tsx`, line 48-51, `fetchUserRole` is called but not awaited before `setLoading(false)`:

```text
if (session?.user) {
  fetchUserRole(session.user.id);  // <-- async, NOT awaited
}
setLoading(false);  // <-- runs immediately, before role is fetched
```

## Solution
Await the role fetch before setting `loading` to `false` during initial load. This ensures `ProtectedRoute` has both `user` and `userRole` available before rendering decisions are made.

### Change in `src/hooks/useAuth.tsx`

Update the `getSession` block (lines 43-52) to await `fetchUserRole`:

```typescript
// THEN check for existing session
const initializeAuth = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    setUser(session?.user ?? null);

    if (session?.user) {
      await fetchUserRole(session.user.id);
    }
  } catch (error) {
    console.error('Auth initialization error:', error);
  } finally {
    setLoading(false);
  }
};

initializeAuth();
```

This is a single-file change. The `onAuthStateChange` listener remains unchanged (it correctly uses `setTimeout` to avoid deadlocks). Only the initial load path is modified to ensure the role is fully resolved before the app renders protected routes.
