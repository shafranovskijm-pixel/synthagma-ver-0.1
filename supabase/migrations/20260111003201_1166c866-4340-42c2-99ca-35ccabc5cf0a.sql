-- Create a more comprehensive function to handle demo account setup
CREATE OR REPLACE FUNCTION public.assign_demo_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_org_id uuid;
BEGIN
  -- Assign admin role for admin demo account
  IF NEW.email = 'admin@demo.sigma' THEN
    UPDATE public.user_roles 
    SET role = 'admin' 
    WHERE user_id = NEW.id;
    
  -- Handle organization demo account  
  ELSIF NEW.email = 'org@demo.sigma' THEN
    -- Create demo organization if needed
    SELECT id INTO demo_org_id FROM public.organizations WHERE email = 'org@demo.sigma';
    
    IF demo_org_id IS NULL THEN
      INSERT INTO public.organizations (name, email)
      VALUES ('Демо Организация', 'org@demo.sigma')
      RETURNING id INTO demo_org_id;
    END IF;
    
    -- Update user role to organization
    UPDATE public.user_roles 
    SET role = 'organization', organization_id = demo_org_id
    WHERE user_id = NEW.id;
    
    -- Update profile with organization
    UPDATE public.profiles 
    SET organization_id = demo_org_id
    WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;