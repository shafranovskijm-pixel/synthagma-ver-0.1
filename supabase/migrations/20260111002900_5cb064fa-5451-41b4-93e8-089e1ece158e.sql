-- Create a function to handle demo account role assignment
CREATE OR REPLACE FUNCTION public.assign_demo_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Assign admin role for admin demo account
  IF NEW.email = 'admin@demo.sigma' THEN
    UPDATE public.user_roles 
    SET role = 'admin' 
    WHERE user_id = NEW.id;
  -- Assign organization role for organization demo account
  ELSIF NEW.email = 'org@demo.sigma' THEN
    UPDATE public.user_roles 
    SET role = 'organization' 
    WHERE user_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to run after user is created
DROP TRIGGER IF EXISTS on_demo_account_created ON auth.users;
CREATE TRIGGER on_demo_account_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_demo_role();