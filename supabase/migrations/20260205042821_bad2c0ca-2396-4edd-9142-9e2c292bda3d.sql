-- Add unique constraint on record_id for labor_safety_profiles
ALTER TABLE public.labor_safety_profiles 
ADD CONSTRAINT labor_safety_profiles_record_id_key UNIQUE (record_id);