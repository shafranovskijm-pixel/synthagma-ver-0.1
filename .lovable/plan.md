

## Plan: Sequential GigaChat Requests with Model Fallback

### Problem
GigaChat Freemium plan supports only **1 concurrent stream**. The pipeline currently sends requests with only 2s delays between batches, which triggers 429 rate limits. Additionally, the screenshot shows **GigaChat Pro subscription tokens are exhausted** — only package tokens (960K) remain, plus GigaChat Lite has 891K tokens.

### Changes

#### 1. `supabase/functions/_shared/gigachat-client.ts`
- Add a **global mutex/queue** so only one GigaChat request runs at a time across all callers within the same edge function invocation
- Add a configurable **post-request delay** (default 3s) after each GigaChat call completes before releasing the lock
- On 429 from GigaChat, wait 10s then retry once before falling back to Lovable AI
- Change default model from `GigaChat-2-Pro` to `GigaChat-2-Max` (has 50K tokens available) with fallback chain: Max → Lite → Lovable AI

#### 2. `src/components/admin/BulkPipelineWidget.tsx`
- Increase inter-batch delay from 2s to **5s** (line 442)
- Add a **3s delay** after each content generation call (line 498-510 area)
- Add a **3s delay** after structure generation call (line 456 area)
- Display which AI model was used in the log entries (from response `data.model`)

### Technical Details

**Mutex in gigachat-client.ts:**
```typescript
let requestLock: Promise<void> = Promise.resolve();

async function withGigaChatLock<T>(fn: () => Promise<T>, delayMs = 3000): Promise<T> {
  const prev = requestLock;
  let resolve: () => void;
  requestLock = new Promise(r => { resolve = r; });
  await prev;
  try {
    const result = await fn();
    await new Promise(r => setTimeout(r, delayMs));
    return result;
  } finally {
    resolve!();
  }
}
```

**Model fallback chain in `callGigaChat`:**
Try GigaChat-2-Max first (50K tokens). On failure/429, try GigaChat-2-Lite (891K tokens). On failure, fall back to Lovable AI.

**Pipeline delays:**
All AI-calling points in `processCourse` will have explicit sequential waits — no concurrent requests possible.

