ALTER TABLE public.courses ADD COLUMN source_order_id uuid REFERENCES public.marketplace_orders(id);
ALTER TABLE public.courses ADD COLUMN source_course_id uuid REFERENCES public.courses(id);