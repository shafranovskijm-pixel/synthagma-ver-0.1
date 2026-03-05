

## Plan: Remove image generation from bulk content pipeline

### Problem
Each lesson generates both text content AND an image via separate AI calls. The image generation (`generate-image` function) consumes additional AI credits, causing the balance to run out quickly on a single course.

### Fix

**File: `src/components/admin/BulkContentGenerator.tsx`** — lines 230-253

Remove the entire image generation block. After generating text blocks, save them directly without generating/appending an image.

Replace lines 230-253 with just saving the text blocks:
```typescript
const finalBlocks = [...blocks];

const { error: saveError } = await supabase
  .from("lessons")
  .update({ content: JSON.stringify(finalBlocks) })
  .eq("id", lesson.id);
```

Also remove the `"generating_image"` status update (line 230) since that phase no longer exists.

This is a deletion of ~20 lines in one file. Text generation remains intact; only image generation is removed.

