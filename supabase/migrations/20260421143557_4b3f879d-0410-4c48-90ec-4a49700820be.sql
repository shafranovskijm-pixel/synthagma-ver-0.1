UPDATE public.webinars
SET source_type = 'external',
    player_settings = '{}'::jsonb,
    created_by = NULL
WHERE id = 'b6f98111-5047-4637-8d50-ac5064bde1a1';