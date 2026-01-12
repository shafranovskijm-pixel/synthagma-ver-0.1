-- Add last_visit_at column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Add achievements for returning after a break (if not exists)
INSERT INTO public.achievements (code, name, description, icon, color, category, rarity, condition_type, condition_value, is_secret)
VALUES 
  ('welcome_back', 'С возвращением!', 'Вернулся после 3+ дней отсутствия', 'HandWaving', '#10B981', 'return', 'common', 'return_days', 3, false),
  ('long_break', 'Долгая разлука', 'Вернулся после 7+ дней отсутствия', 'Clock', '#3B82F6', 'return', 'rare', 'return_days', 7, false),
  ('comeback_king', 'Король камбэков', 'Вернулся после 30+ дней отсутствия', 'Crown', '#8B5CF6', 'return', 'epic', 'return_days', 30, false),
  ('phoenix', 'Феникс', 'Возродился из пепла после 90+ дней', 'Flame', '#F97316', 'return', 'legendary', 'return_days', 90, true)
ON CONFLICT (code) DO NOTHING;

-- Create function to track visits and award return achievements
CREATE OR REPLACE FUNCTION public.track_user_visit(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_visit TIMESTAMP WITH TIME ZONE;
  v_days_away INTEGER;
BEGIN
  -- Get last visit time
  SELECT last_visit_at INTO v_last_visit
  FROM profiles
  WHERE user_id = p_user_id;
  
  -- Calculate days since last visit
  IF v_last_visit IS NOT NULL THEN
    v_days_away := EXTRACT(DAY FROM (now() - v_last_visit));
    
    -- Award return achievements based on days away
    IF v_days_away >= 90 THEN
      PERFORM award_achievement(p_user_id, 'phoenix');
      PERFORM award_achievement(p_user_id, 'comeback_king');
      PERFORM award_achievement(p_user_id, 'long_break');
      PERFORM award_achievement(p_user_id, 'welcome_back');
    ELSIF v_days_away >= 30 THEN
      PERFORM award_achievement(p_user_id, 'comeback_king');
      PERFORM award_achievement(p_user_id, 'long_break');
      PERFORM award_achievement(p_user_id, 'welcome_back');
    ELSIF v_days_away >= 7 THEN
      PERFORM award_achievement(p_user_id, 'long_break');
      PERFORM award_achievement(p_user_id, 'welcome_back');
    ELSIF v_days_away >= 3 THEN
      PERFORM award_achievement(p_user_id, 'welcome_back');
    END IF;
  END IF;
  
  -- Update last visit time
  UPDATE profiles
  SET last_visit_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.track_user_visit(UUID) TO authenticated;