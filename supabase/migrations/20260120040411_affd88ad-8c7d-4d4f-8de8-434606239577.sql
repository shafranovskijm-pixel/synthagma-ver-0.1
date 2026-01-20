-- Add telegram_chat_id to organizations for notifications
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- Add telegram_chat_id to organization_reminders for specific reminder notifications
ALTER TABLE public.organization_reminders 
ADD COLUMN IF NOT EXISTS telegram_chat_id text;