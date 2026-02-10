DROP VIEW IF EXISTS test_questions_for_students;

CREATE VIEW test_questions_for_students AS
SELECT id,
    lesson_id,
    question,
    options,
    order_index,
    explanation,
    is_bank_question,
    image_url,
        CASE
            WHEN has_role('organization'::app_role, auth.uid()) OR has_role('admin'::app_role, auth.uid()) THEN correct_answer
            ELSE NULL::integer
        END AS correct_answer
   FROM test_questions tq
  WHERE (EXISTS ( SELECT 1
           FROM lessons l
             JOIN courses c ON c.id = l.course_id
          WHERE l.id = tq.lesson_id AND (c.is_published = true OR c.organization_id = current_organization_id())));