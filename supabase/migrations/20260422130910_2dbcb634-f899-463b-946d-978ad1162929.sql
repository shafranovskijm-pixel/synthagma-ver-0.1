DELETE FROM lessons l1
USING lessons l2
WHERE l1.module_id IN (SELECT id FROM course_modules WHERE course_id = '32fb43d7-7dfa-44ef-bc92-97fd8938eec5')
  AND l1.module_id = l2.module_id
  AND l1.order_index = l2.order_index
  AND l1.id > l2.id;