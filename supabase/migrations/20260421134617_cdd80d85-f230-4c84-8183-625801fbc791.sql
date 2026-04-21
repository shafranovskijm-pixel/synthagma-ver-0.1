
-- Add public_slug to organizations for /o/:slug public showcase
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS public_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_public_slug_uidx
  ON public.organizations (public_slug) WHERE public_slug IS NOT NULL;

-- Slug generator: transliterate cyrillic, lowercase, replace non-alphanumeric with hyphens
CREATE OR REPLACE FUNCTION public.generate_org_slug(p_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v text;
BEGIN
  v := lower(coalesce(p_name, ''));
  -- transliterate cyrillic
  v := translate(v,
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
    'abvgdeejziiklmnoprstufhccssyyeya'  -- грубая транслитерация
  );
  -- replace non-alphanumeric with hyphen
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := trim(both '-' from v);
  IF v = '' THEN v := 'org'; END IF;
  RETURN v;
END;
$$;

-- Backfill existing orgs with unique slugs
DO $$
DECLARE
  r record;
  base_slug text;
  candidate text;
  n int;
BEGIN
  FOR r IN SELECT id, name FROM public.organizations WHERE public_slug IS NULL LOOP
    base_slug := public.generate_org_slug(r.name);
    candidate := base_slug;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE public_slug = candidate) LOOP
      n := n + 1;
      candidate := base_slug || '-' || n;
    END LOOP;
    UPDATE public.organizations SET public_slug = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- Trigger to auto-fill slug on insert
CREATE OR REPLACE FUNCTION public.set_org_public_slug()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  base_slug text;
  candidate text;
  n int := 1;
BEGIN
  IF NEW.public_slug IS NULL OR NEW.public_slug = '' THEN
    base_slug := public.generate_org_slug(NEW.name);
    candidate := base_slug;
    WHILE EXISTS (SELECT 1 FROM public.organizations WHERE public_slug = candidate AND id <> NEW.id) LOOP
      n := n + 1;
      candidate := base_slug || '-' || n;
    END LOOP;
    NEW.public_slug := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_org_public_slug ON public.organizations;
CREATE TRIGGER trg_set_org_public_slug
  BEFORE INSERT OR UPDATE OF name ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_org_public_slug();
