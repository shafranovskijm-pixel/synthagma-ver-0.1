-- Create marketplace courses table for courses listed for sale
CREATE TABLE public.marketplace_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  price_student NUMERIC NOT NULL DEFAULT 0,
  price_organization NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description_short TEXT,
  preview_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(course_id)
);

-- Create marketplace orders table
CREATE TABLE public.marketplace_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  marketplace_course_id UUID NOT NULL REFERENCES public.marketplace_courses(id) ON DELETE CASCADE,
  buyer_user_id UUID,
  buyer_organization_id UUID REFERENCES public.organizations(id),
  buyer_type TEXT NOT NULL CHECK (buyer_type IN ('student', 'organization')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'completed', 'cancelled')),
  price NUMERIC NOT NULL,
  students_count INTEGER DEFAULT 1,
  notes TEXT,
  payment_method TEXT CHECK (payment_method IN ('invoice', 'online', null)),
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketplace_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;

-- RLS policies for marketplace_courses
CREATE POLICY "Anyone can view active marketplace courses"
ON public.marketplace_courses
FOR SELECT
USING (is_active = true);

CREATE POLICY "Org users can manage their marketplace courses"
ON public.marketplace_courses
FOR ALL
USING (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
WITH CHECK (organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()));

-- RLS policies for marketplace_orders
CREATE POLICY "Sellers can view orders for their courses"
ON public.marketplace_orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM marketplace_courses mc
    WHERE mc.id = marketplace_orders.marketplace_course_id
    AND (mc.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
);

CREATE POLICY "Sellers can update orders for their courses"
ON public.marketplace_orders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM marketplace_courses mc
    WHERE mc.id = marketplace_orders.marketplace_course_id
    AND (mc.organization_id = current_organization_id() OR has_role('admin'::app_role, auth.uid()))
  )
);

CREATE POLICY "Buyers can view own orders"
ON public.marketplace_orders
FOR SELECT
USING (buyer_user_id = auth.uid() OR buyer_organization_id = current_organization_id());

CREATE POLICY "Buyers can create orders"
ON public.marketplace_orders
FOR INSERT
WITH CHECK (buyer_user_id = auth.uid() OR buyer_organization_id = current_organization_id());

-- Update trigger for updated_at
CREATE TRIGGER update_marketplace_courses_updated_at
BEFORE UPDATE ON public.marketplace_courses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketplace_orders_updated_at
BEFORE UPDATE ON public.marketplace_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();