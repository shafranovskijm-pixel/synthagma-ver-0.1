INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('company_card_public_token', gen_random_uuid()::text)
ON CONFLICT DO NOTHING;