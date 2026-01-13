-- Create system_settings table for global settings like yearly discount
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read settings (needed for landing page calculator)
CREATE POLICY "System settings are publicly readable"
ON public.system_settings
FOR SELECT
USING (true);

-- Only admins can modify settings (using user_roles table)
CREATE POLICY "Admins can modify system settings"
ON public.system_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_roles.user_id = auth.uid() 
    AND user_roles.role = 'admin'
  )
);

-- Insert default yearly discount setting
INSERT INTO public.system_settings (key, value, description)
VALUES ('yearly_discount', '{"percentage": 20}', 'Скидка за годовую оплату в процентах');

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();