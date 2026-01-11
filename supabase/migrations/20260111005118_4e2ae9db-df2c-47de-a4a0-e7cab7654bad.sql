-- Fix the assign_demo_role function - remove organization_id reference from user_roles
CREATE OR REPLACE FUNCTION public.assign_demo_role()
RETURNS TRIGGER AS $$
DECLARE
  demo_org_id uuid;
BEGIN
  -- Handle admin demo account
  IF NEW.email = 'admin@demo.sigma' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
  END IF;
  
  -- Handle organization demo account
  IF NEW.email = 'org@demo.sigma' THEN
    -- First create/find the demo organization
    SELECT id INTO demo_org_id FROM public.organizations WHERE name = 'Демо Организация';
    
    IF demo_org_id IS NULL THEN
      INSERT INTO public.organizations (name, email)
      VALUES ('Демо Организация', 'org@demo.sigma')
      RETURNING id INTO demo_org_id;
    END IF;
    
    -- Assign organization role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'organization')
    ON CONFLICT (user_id) DO UPDATE SET role = 'organization';
    
    -- Update profile with organization_id
    UPDATE public.profiles 
    SET organization_id = demo_org_id
    WHERE user_id = NEW.id;
  END IF;
  
  -- Handle student demo account - just ensure student role (default)
  IF NEW.email = 'student@demo.sigma' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student')
    ON CONFLICT (user_id) DO UPDATE SET role = 'student';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;