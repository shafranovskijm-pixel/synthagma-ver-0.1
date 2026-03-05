

## Plan: Fix 3 Bugs in Bulk Content Generator

### Bug 1: Stale state after structure generation
In `startFullPipeline()`, after `generateStructure()` calls `loadLessons()` which does `setLessons(items)`, the React state hasn't updated yet when `generateContent()` runs on the next line. So `lessons` is still empty, `contentLessons` is 0, nothing gets generated.

**Fix**: Make `generateStructure` return the newly loaded lessons, and make `generateContent` / `solveTests` accept a `lessonsOverride` parameter instead of reading from stale state.

### Bug 2: Test solving fails — response truncated
The gigachat function uses `max_tokens: 4096` which is too small for 50+ questions with explanations. The AI response gets cut off mid-JSON, `JSON.parse` fails, and `parseError: true` is returned.

**Fix**: 
- In `gigachat/index.ts`: increase `max_tokens` to 16384 for the `generate_answers` action
- In `BulkContentGenerator.tsx`: batch test questions in groups of 20 to avoid truncation, then merge results

### Bug 3: Practice lessons skipped
Structure generation inserts practice as `type: "text"` with placeholder content `[{"type":"heading1","content":"Практическое задание"}]`. The `isContentEmpty` function correctly detects this as empty. But in `generateContent`, `isPractice` check at line 171 looks at `lesson.content` from the *state* which might not match. Also the lesson type is "text" not "practice" so the edge function gets `lessonType: "text"` instead of `"practice"`.

**Fix**: Check content string for "Практическое задание" to determine practice type. Ensure `isContentEmpty` handles this correctly.

### Changes

**1. `src/components/admin/BulkContentGenerator.tsx`**

- `generateStructure()` → returns `LessonItem[]` after reload
- `generateContent(overrideLessons?)` → uses passed lessons if provided, not stale state
- `solveTests(overrideLessons?)` → same pattern
- `startFullPipeline()`: pass freshly loaded lessons to phase 2 and 3
- Batch test questions in groups of 20 when calling gigachat
- Recalculate `totalToProcess` after structure is created using fresh data

**2. `supabase/functions/gigachat/index.ts`**
- Increase `max_tokens` from 4096 to 16384 for `generate_answers` action
- Keep 4096 for other actions

**3. `supabase/functions/generate-course-structure/index.ts`**
- Add explicit instruction: the last lesson MUST be titled "Итоговое тестирование"
- Post-process: rename and reorder if AI doesn't comply

