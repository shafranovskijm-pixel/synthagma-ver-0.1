DO $$
DECLARE
  cat_map jsonb := '{
    "ff6125fa-7727-4d1f-9cde-6be465ff6fc8": ["marketplace/electrobezopasnost/cover-1.png","marketplace/electrobezopasnost/cover-2.png","marketplace/electrobezopasnost/cover-3.png"],
    "8a6f873d-6008-4c65-a66f-35051261a17c": ["marketplace/energetika/cover-1.png","marketplace/energetika/cover-2.png","marketplace/energetika/cover-3.png"],
    "195ead76-d072-4d47-889b-31ce90fafd21": ["marketplace/ohrana-truda/cover-1.png","marketplace/ohrana-truda/cover-2.png","marketplace/ohrana-truda/cover-3.png","marketplace/ohrana-truda/cover-4.png","marketplace/ohrana-truda/cover-5.png"],
    "1d801354-6f17-4d31-a3e4-8942f5c5c69b": ["marketplace/ohrana-truda/cover-1.png","marketplace/ohrana-truda/cover-2.png","marketplace/ohrana-truda/cover-3.png","marketplace/ohrana-truda/cover-4.png","marketplace/ohrana-truda/cover-5.png"],
    "34bb8080-ddd6-407a-b897-e004976cf2ac": ["marketplace/meditsina/cover-1.png","marketplace/meditsina/cover-2.png","marketplace/meditsina/cover-3.png"],
    "17c8b981-bc6b-4bb4-a337-d81c5bb8f744": ["marketplace/rabochie-professii/cover-1.png","marketplace/rabochie-professii/cover-2.png","marketplace/rabochie-professii/cover-3.png"],
    "4972cc13-a7f9-46f4-842a-a5d981a55963": ["marketplace/pozharnaya/cover-1.png"],
    "f4618ecf-11cf-46a7-a133-dcad93dbe7bd": ["marketplace/stroitelnye/cover-1.png"],
    "588dc3eb-719e-495a-bc80-7c0b90a4e7e1": ["marketplace/prombezopasnost/cover-1.png"],
    "a80ff6fa-b119-4ece-b23d-de126442f99f": ["marketplace/mashinist/cover-1.png"],
    "e5027f32-19ef-459d-b732-740af9f092e4": ["marketplace/slesari/cover-1.png"],
    "13e2cb71-e10a-4a5c-9dee-cdfbe4a78a11": ["marketplace/ekologicheskaya/cover-1.png"],
    "dd9b1a39-4408-4d89-991e-236ffb5367ef": ["marketplace/stroitelnyi-kontrol/cover-1.png"],
    "dbed329e-f257-43d5-a742-609834b892cf": ["marketplace/profperepodgotovka/cover-1.png"],
    "c63aa16e-d63c-4b0c-b0c2-a626ca7eda99": ["marketplace/raznoe/cover-1.png"]
  }'::jsonb;
  base_url text := 'https://atxwvjxbqjgkbjlhsdch.supabase.co/storage/v1/object/public/course-files/';
  cat_id text;
  paths jsonb;
  arr_len int;
BEGIN
  FOR cat_id, paths IN SELECT * FROM jsonb_each(cat_map) LOOP
    arr_len := jsonb_array_length(paths);

    WITH ranked AS (
      SELECT id,
             ((row_number() OVER (ORDER BY created_at, id) - 1) % arr_len)::int AS pick
      FROM courses
      WHERE category_id = cat_id::uuid
        AND (cover_image_url IS NULL OR cover_image_url = '')
    )
    UPDATE courses c
    SET cover_image_url = base_url || (paths ->> ranked.pick)
    FROM ranked
    WHERE c.id = ranked.id;
  END LOOP;

  UPDATE marketplace_courses mc
  SET preview_image_url = c.cover_image_url
  FROM courses c
  WHERE mc.course_id = c.id
    AND mc.organization_id = '4ac2c05a-d8b5-4e72-ba31-f2c743091d95'
    AND (mc.preview_image_url IS NULL OR mc.preview_image_url = '')
    AND c.cover_image_url IS NOT NULL;
END $$;