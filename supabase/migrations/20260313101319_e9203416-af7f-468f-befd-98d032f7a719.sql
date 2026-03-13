-- Create "Профессиональная переподготовка" category for org f8e0e2a3 and move course
INSERT INTO course_categories (name, organization_id, parent_type)
VALUES 
  ('Профессиональная переподготовка', 'f8e0e2a3-ad18-43e1-b7dc-612d397861c3', 'Профессиональная переподготовка'),
  ('Профессиональная переподготовка', '4ac2c05a-d8b5-4e72-ba31-f2c743091d95', 'Профессиональная переподготовка')
ON CONFLICT DO NOTHING;

-- Move courses to their org's new category
UPDATE courses SET category_id = (
  SELECT id FROM course_categories 
  WHERE name = 'Профессиональная переподготовка' 
  AND organization_id = 'f8e0e2a3-ad18-43e1-b7dc-612d397861c3'
  LIMIT 1
) WHERE id = '57c5d00e-fd85-4857-99b7-40f3c3085a33';

UPDATE courses SET category_id = (
  SELECT id FROM course_categories 
  WHERE name = 'Профессиональная переподготовка' 
  AND organization_id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
  LIMIT 1
) WHERE id = 'a56ba1ec-a968-42e1-b7b3-abd5ce72d60c';