-- Create missing categories: Рабочие профессии and Разное
INSERT INTO course_categories (organization_id, name, parent_type, order_index)
VALUES 
  ('4ac2c05a-d8b5-4e72-ba31-f2c743091d95', 'Рабочие профессии', 'Рабочие профессии', 10),
  ('4ac2c05a-d8b5-4e72-ba31-f2c743091d95', 'Разное', 'Повышение квалификации', 11)
ON CONFLICT DO NOTHING;