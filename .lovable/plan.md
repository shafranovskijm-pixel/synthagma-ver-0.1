

## Plan: Bulk AI Content Generation for Marketplace Courses

### Problem
You have 200+ courses with many text lessons that need content (text + image). Generating content for each lesson individually is very time-consuming.

### Solution
Add a "Bulk AI Generation" button to each course row in the admin marketplace catalog. When clicked, it opens a dialog that:

1. Fetches all text-type lessons for the selected course
2. Shows a checklist of lessons (pre-selected: those without content)
3. On "Generate" — sequentially processes each selected lesson:
   - Calls `generate-lesson-content` to create text blocks
   - Calls `generate-image` with a prompt based on lesson title to create 1 illustration
   - Saves both to the lesson's `content` field
4. Shows real-time progress (lesson X of Y, with status per lesson)

### Files to create/modify

**1. New component: `src/components/admin/BulkContentGenerator.tsx`**
- Dialog with course title header
- Loads lessons via `supabase.from('lessons').select('*').eq('course_id', courseId)`
- Checkbox list of lessons (auto-select those with empty content)
- "Select all / Deselect all" toggle
- Progress bar + per-lesson status (pending / generating text / generating image / done / error)
- Sequential processing with delay between requests (avoid rate limits)
- Save generated blocks + image block to lesson content
- Error handling with retry option per lesson

**2. Modify: `src/components/admin/AdminMarketplaceManager.tsx`**
- Add a new "AI Content" button (Sparkles icon) to each course row in `renderCourseRow`
- Import and render `BulkContentGenerator` dialog

**3. Modify: `supabase/functions/generate-lesson-content/index.ts`**
- No changes needed — already supports text lesson generation

**4. Edge function `generate-image` already exists**
- Will reuse it to generate 1 image per lesson based on lesson title

### Processing flow per lesson
```text
For each selected lesson:
  1. Call generate-lesson-content → get blocks[]
  2. Call generate-image with prompt = lesson title → get image URL
  3. Append image block to blocks[]
  4. Save combined content JSON to lessons.content
  5. Update progress UI
  6. Wait 2s before next lesson (rate limit protection)
```

### UI in the catalog row
A small Sparkles icon button next to the existing BookOpen/Edit/Delete buttons, opening the bulk generator dialog.

