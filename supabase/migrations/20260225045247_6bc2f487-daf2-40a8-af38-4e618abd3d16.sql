ALTER TABLE public.commercial_proposals 
  ADD COLUMN sender_name text DEFAULT 'СИНТАГМА',
  ADD COLUMN sender_email text DEFAULT 'support@sintagma.com.ru',
  ADD COLUMN sender_website text DEFAULT 'https://sintagma.com.ru/';