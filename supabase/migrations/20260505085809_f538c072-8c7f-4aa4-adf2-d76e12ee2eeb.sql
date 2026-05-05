-- Default menu_settings for new organizations: folder view + grid
CREATE OR REPLACE FUNCTION public.set_default_org_menu_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.menu_settings IS NULL OR NEW.menu_settings = '{}'::jsonb THEN
    NEW.menu_settings := jsonb_build_object(
      'courseViewMode', 'grid',
      'courseFolderMode', 'folders'
    );
  ELSE
    IF NOT (NEW.menu_settings ? 'courseFolderMode') THEN
      NEW.menu_settings := NEW.menu_settings || jsonb_build_object('courseFolderMode', 'folders');
    END IF;
    IF NOT (NEW.menu_settings ? 'courseViewMode') THEN
      NEW.menu_settings := NEW.menu_settings || jsonb_build_object('courseViewMode', 'grid');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_org_menu_settings ON public.organizations;
CREATE TRIGGER trg_set_default_org_menu_settings
  BEFORE INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_default_org_menu_settings();

-- Backfill: organizations that don't have courseFolderMode get 'folders'
UPDATE public.organizations
SET menu_settings = COALESCE(menu_settings, '{}'::jsonb)
  || jsonb_build_object('courseFolderMode', 'folders')
WHERE menu_settings IS NULL
   OR NOT (menu_settings ? 'courseFolderMode');

UPDATE public.organizations
SET menu_settings = menu_settings || jsonb_build_object('courseViewMode', 'grid')
WHERE NOT (menu_settings ? 'courseViewMode');
