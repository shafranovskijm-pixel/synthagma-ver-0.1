

## Plan: Simplify Order Dialog

### Changes in `src/components/organization/CourseStoreManager.tsx`

**1. Remove "Количество студентов" block (lines 368-374)**
Remove the student count input and the "Итого" total price line entirely from the order dialog.

**2. Fix "Продавец" display (line 366)**
Update the seller name logic:
- If the course has no organization (platform course, `organization` is null), display "Платформа Синтагма"
- Otherwise, display the organization's name as before

```text
Before: {h.selectedCourseForOrder?.organization?.name}
After:  {h.selectedCourseForOrder?.organization?.name || "Платформа Синтагма"}
```

### Files to modify
- `src/components/organization/CourseStoreManager.tsx` -- two edits only

