
# Plan: Improve post-purchase flow for marketplace courses

## What changes

### 1. Update success dialog text
Change the success popup in `CourseStoreManager.tsx` from "Заявка отправлена! Продавец получит уведомление и свяжется с вами." to a more appropriate message depending on whether the course was paid from balance (instant purchase) or submitted as a pending order:
- **Paid from balance**: "Курс добавлен! Курс теперь доступен в разделе «Курсы». Приятного использования!"
- **Pending order**: Keep the current message about the seller being notified

### 2. Copy course to buyer's organization after balance payment
When an organization pays from balance (instant purchase), the course and its lessons/test questions should be cloned into the buyer's organization so it appears in their "Курсы" tab.

After the order is created and balance is deducted in `useCourseStoreManager.ts`, add logic to:
1. Fetch the original course data
2. Create a copy of the course with the buyer's `organization_id`
3. Copy all lessons linked to that course
4. Copy all test questions linked to those lessons (remapping `lesson_id` to new lesson IDs)

### 3. Track the purchase origin
Add an `source_order_id` column to the `courses` table (nullable UUID) to track which courses were purchased from the marketplace, preventing duplicate purchases.

---

## Technical details

### Database migration
```sql
ALTER TABLE public.courses ADD COLUMN source_order_id uuid REFERENCES public.marketplace_orders(id);
ALTER TABLE public.courses ADD COLUMN source_course_id uuid REFERENCES public.courses(id);
```

### Changes to `src/hooks/useCourseStoreManager.ts`

After balance deduction succeeds (around line 311), add a course cloning function:

```typescript
// Clone course to buyer's organization
if (payFromBalance && orderData) {
  const originalCourseId = selectedCourseForOrder.course_id;
  
  // 1. Fetch original course
  const { data: origCourse } = await supabase
    .from('courses').select('*').eq('id', originalCourseId).single();
  
  // 2. Create copy for buyer org
  const { data: newCourse } = await supabase.from('courses').insert({
    ...origCourse,
    id: undefined, // auto-generate
    organization_id: organizationId,
    source_order_id: orderData.id,
    source_course_id: originalCourseId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('id').single();
  
  // 3. Copy lessons
  const { data: lessons } = await supabase
    .from('lessons').select('*').eq('course_id', originalCourseId).order('order_index');
  
  if (lessons && newCourse) {
    for (const lesson of lessons) {
      const { data: newLesson } = await supabase.from('lessons').insert({
        ...lesson,
        id: undefined,
        course_id: newCourse.id,
      }).select('id').single();
      
      // 4. Copy test questions for this lesson
      if (newLesson) {
        const { data: questions } = await supabase
          .from('test_questions').select('*').eq('lesson_id', lesson.id);
        if (questions?.length) {
          await supabase.from('test_questions').insert(
            questions.map(q => ({ ...q, id: undefined, lesson_id: newLesson.id }))
          );
        }
      }
    }
  }
}
```

A new state variable `purchasedFromBalance` will be added to differentiate the success dialog message.

### Changes to `src/components/organization/CourseStoreManager.tsx`

Update the success dialog (lines 388-398) to show different content based on whether the purchase was instant (balance) or a pending order:

- **Balance payment**: Title "Курс добавлен!", description "Курс теперь доступен в разделе «Курсы». Приятного использования!"
- **Pending order**: Title "Заявка отправлена!", description "Продавец получит уведомление и свяжется с вами."
