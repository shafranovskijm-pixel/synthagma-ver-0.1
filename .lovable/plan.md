

## Plan: One-Button Full Course Generation (Structure + Content + Tests)

### Problem
The current bulk generator only works with existing text lessons. You need a single button that:
1. Generates course structure (lessons) if none exist
2. Generates text content + image for each lecture
3. Generates test questions with correct answers for test lessons
4. Uses a better prompt: no video/audio, includes practical tasks and case studies

### Changes

**1. Update edge function prompt: `supabase/functions/generate-course-structure/index.ts`**
- Remove video and audio from allowed lesson types
- New types: `"text"` (lecture), `"test"` (test), `"practice"` (practical task/case study)
- Updated prompt:
  - 8-15 lessons depending on complexity
  - Structure: Introduction lecture -> 2-3 theory lectures -> test -> 2-3 more lectures -> practical task -> more theory -> final test
  - Practical tasks: case studies, situational tasks, document analysis exercises
  - No video, no audio
  - Test after every 2-3 lectures
  - At least 1-2 practical tasks in the course
  - End with a final comprehensive test

**2. Rewrite `src/components/admin/BulkContentGenerator.tsx`**

Add a new "full pipeline" mode that runs in 3 phases:

- **Phase 1 — Structure**: If course has 0 lessons, call `generate-course-structure` to create them, then insert into `lessons` table. If lessons exist, skip this phase.
- **Phase 2 — Content**: For each `text`/`practice` lesson without content, call `generate-lesson-content` for text blocks + `generate-image` for illustration. Save to `lessons.content`.
- **Phase 3 — Tests**: For each `test` lesson, call `generate-lesson-content` with `lessonType: "test"`, then insert questions into `test_questions` table with correct answers.

UI changes:
- Show 3 phase indicators (Structure / Content / Tests)
- Show which phase is active
- Keep existing per-lesson progress tracking
- Filter shows ALL lesson types (not just text)
- For test lessons, status includes "generating_questions"

**3. Update `generate-lesson-content` edge function for practice type**
- Add a `"practice"` branch in the system prompt that generates case studies / situational tasks with instructions, context, and expected outcomes
- Practice content uses the same `blocks` format as text lessons

**4. Minor: `AdminMarketplaceManager.tsx`**
- No changes needed, button already exists

### Processing flow
```text
Phase 1 (if no lessons):
  Call generate-course-structure → get lesson[]
  Insert all lessons into DB
  Reload lesson list

Phase 2 (content for text/practice lessons):
  For each text/practice lesson without content:
    generate-lesson-content → blocks[]
    generate-image → imageUrl
    Save blocks + image to lessons.content
    Wait 2s

Phase 3 (test questions):
  For each test lesson:
    generate-lesson-content (type=test) → questions[]
    Insert into test_questions table
    Wait 2s
```

### Updated Structure Prompt (key points)
- Lesson types: text, test, practice
- Practice = situational tasks, case analysis, document review exercises
- No video/audio
- Regulatory compliance: reference current laws/GOSTs
- 8-15 lessons, logical progression
- Pattern: intro → theory → test → theory → practice → theory → final test

