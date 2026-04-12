

# Fix: SkillSpace parser not importing lesson content for some courses

## Problem

The "Школа Целительства" course imported 37 lessons but ALL have empty content ("Пустой урок"). The lesson API returns only ~487 bytes per lesson, while working courses return 15-55KB. This means `pagesPublished` and `pages` are empty in the response.

Different SkillSpace schools/courses store content differently. Some embed pages directly in the lesson object, others store them separately and require an additional API call to fetch page content.

## Root Cause

The parser fetches `/api/rest/school/lesson/{uuid}` and expects `pagesPublished` or `pages` to contain content blocks inline. For this course, those fields are empty arrays. The content needs to be fetched from a separate pages endpoint.

## Plan

### 1. Add fallback page fetching in `parse-skillspace-course/index.ts`

When `pagesPublished` and `pages` are empty (no blocks found), try these additional endpoints to fetch page content:

- `/api/rest/school/lesson/{uuid}/page/list`
- `/api/rest/school/lesson/{uuid}/page`  
- `/api/rest/school/step/{id}/page/list`
- `/api/rest/school/step/{id}/page`

Also log the raw lesson keys and first 500 chars when content is empty for better debugging.

### 2. Add raw response logging for empty lessons

When a lesson returns ~487 bytes and no blocks are found, log the actual response body (truncated) so we can see the exact data structure SkillSpace returns. This helps diagnose future content extraction issues.

### 3. Try `version: "published"` query parameter

Some SkillSpace APIs require `?version=published` to return the published content. Add this parameter to the lesson fetch.

### Technical Details

**File**: `supabase/functions/parse-skillspace-course/index.ts`

In the lesson content extraction section (around line 615-655), after failing to find blocks in `pagesPublished`/`pages`/`blocks`, add:

```typescript
// Fallback: fetch pages separately
if (jsonBlocks.length === 0) {
  const pagePaths = [
    `/api/rest/school/lesson/${lesson.uuid}/page/list`,
    `/api/rest/school/lesson/${lesson.uuid}/page`,
    `/api/rest/school/step/${lesson.uuid}/page/list`,
    `/api/rest/school/step/${lesson.id}/page/list`,
  ];
  for (const pagePath of pagePaths) {
    const pageRes = await apiFetch(pagePath);
    if (pageRes.ok && pageRes.data) {
      // Extract blocks from pages response
      const pagesArray = Array.isArray(pageRes.data) ? pageRes.data : 
                         pageRes.data.pages || pageRes.data.list || [pageRes.data];
      for (const page of pagesArray) {
        const blocks = page.content?.blocks || page.blocks || [];
        if (blocks.length > 0) {
          jsonBlocks.push(...editorBlocksToJsonBlocks(blocks));
        }
      }
      if (jsonBlocks.length > 0) {
        log(`Fallback page fetch success via ${pagePath}: ${jsonBlocks.length} blocks`);
        break;
      }
    }
  }
}

// Log raw data when still empty for debugging
if (jsonBlocks.length === 0) {
  const rawKeys = Object.keys(lessonData).join(", ");
  log(`Empty lesson "${lessonTitle}" keys: ${rawKeys}`);
  // Log pagesPublished structure
  if (lessonData.pagesPublished) {
    log(`pagesPublished: ${JSON.stringify(lessonData.pagesPublished).substring(0, 300)}`);
  }
}
```

Also modify `apiFetch` to preserve raw text for small responses (under 2KB) so we can debug the actual response structure when lessons are empty.

