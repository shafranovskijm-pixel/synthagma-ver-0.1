-- Create table for service orders
CREATE TABLE public.service_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  service_title TEXT NOT NULL,
  service_price TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

-- Organizations can view their own orders
CREATE POLICY "Organizations can view their own service orders"
ON public.service_orders
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Organizations can create their own orders
CREATE POLICY "Organizations can create their own service orders"
ON public.service_orders
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Admins can view all orders
CREATE POLICY "Admins can view all service orders"
ON public.service_orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Admins can update all orders
CREATE POLICY "Admins can update all service orders"
ON public.service_orders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_service_orders_updated_at
BEFORE UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();