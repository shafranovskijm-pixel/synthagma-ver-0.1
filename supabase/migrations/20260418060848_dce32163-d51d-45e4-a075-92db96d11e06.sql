-- Default admin email for external contract review
INSERT INTO public.app_settings (setting_key, setting_value)
VALUES ('admin_signature_email', 'admin@sintagma.com.ru')
ON CONFLICT (setting_key) DO NOTHING;