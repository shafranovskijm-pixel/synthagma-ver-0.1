

## Plan: Comments on Marketplace Courses + Initial Comment

### Overview

Add a comments section to each marketplace course detail page in the store. Any authenticated user (organization or student) can leave a comment. Also seed an initial platform comment on every course.

---

### Part 1: Database

**New table: `marketplace_course_comments`**

```sql
CREATE TABLE public.marketplace_course_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_course_id uuid NOT NULL REFERENCES public.marketplace_courses(id) ON DELETE CASCADE,
  user_id uuid,
  author_name text NOT NULL DEFAULT 'Платформа Синтагма',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_course_comments ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read comments
CREATE POLICY "Authenticated users can view comments"
  ON marketplace_course_comments FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Authenticated users can add comments
CREATE POLICY "Authenticated users can add comments"
  ON marketplace_course_comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Admins can delete any comment
CREATE POLICY "Admins can delete comments"
  ON marketplace_course_comments FOR DELETE
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));
```

**Seed initial comment on all 3 existing marketplace courses:**

```sql
INSERT INTO marketplace_course_comments (marketplace_course_id, author_name, content)
SELECT id, 'Платформа Синтагма', 'Могу доработать — пишите Ваши пожелания на каждый курс!'
FROM marketplace_courses;
```

---

### Part 2: UI -- Comments Section in Course Detail

**File:** `src/components/organization/CourseStoreManager.tsx`

Add below the action buttons in the `selectedCourseDetail` view:

1. **Comments list** -- fetched from `marketplace_course_comments` for the selected course, showing author name, date, and text
2. **"Add comment" form** -- a `Textarea` + `Button` for submitting a new comment. The author name is pulled from the user's profile or defaults to the organization name
3. Comments ordered newest first

Also add the same section to `src/components/student/StudentCourseStore.tsx` if it has a detail view.

---

### Technical Summary

**Files to modify:**
- `src/components/organization/CourseStoreManager.tsx` -- add comments section in course detail view
- `src/components/student/StudentCourseStore.tsx` -- add comments section if detail view exists

**Database:**
- Create `marketplace_course_comments` table with RLS
- Seed platform comment on all existing marketplace courses
