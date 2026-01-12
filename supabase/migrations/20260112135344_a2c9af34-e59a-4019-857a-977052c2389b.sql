-- Function to award achievement to user (idempotent - ignores duplicates)
CREATE OR REPLACE FUNCTION public.award_achievement(
  p_user_id UUID,
  p_achievement_code TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement_id UUID;
BEGIN
  -- Get achievement id by code
  SELECT id INTO v_achievement_id FROM achievements WHERE code = p_achievement_code;
  
  IF v_achievement_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Insert achievement (ignore if already exists)
  INSERT INTO user_achievements (user_id, achievement_id, is_seen)
  VALUES (p_user_id, v_achievement_id, false)
  ON CONFLICT (user_id, achievement_id) DO NOTHING;
END;
$$;

-- Trigger function for lesson progress (when lesson is completed)
CREATE OR REPLACE FUNCTION public.check_lesson_achievements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed_count INTEGER;
  v_course_id UUID;
  v_total_lessons INTEGER;
  v_course_completed_lessons INTEGER;
  v_course_progress INTEGER;
  v_current_hour INTEGER;
  v_current_dow INTEGER;
BEGIN
  -- Only process when lesson is marked as completed
  IF NEW.completed = true AND (OLD IS NULL OR OLD.completed = false) THEN
    
    -- Get current time info for time-based achievements
    v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Moscow');
    v_current_dow := EXTRACT(DOW FROM NOW() AT TIME ZONE 'Europe/Moscow');
    
    -- Award "First lesson completed" achievement
    PERFORM award_achievement(NEW.user_id, 'on_your_marks');
    
    -- Count total completed lessons for this user
    SELECT COUNT(*) INTO v_completed_count
    FROM lesson_progress
    WHERE user_id = NEW.user_id AND completed = true;
    
    -- Check lessons count achievements
    IF v_completed_count >= 5 THEN
      PERFORM award_achievement(NEW.user_id, 'warmup');
    END IF;
    
    IF v_completed_count >= 25 THEN
      PERFORM award_achievement(NEW.user_id, 'marathon_runner');
    END IF;
    
    -- Check time-based achievements
    IF v_current_hour < 7 THEN
      PERFORM award_achievement(NEW.user_id, 'early_bird');
    END IF;
    
    IF v_current_hour >= 23 OR v_current_hour < 2 THEN
      PERFORM award_achievement(NEW.user_id, 'night_owl');
    END IF;
    
    -- Secret: Weekend midnight learning
    IF (v_current_dow = 0 OR v_current_dow = 6) AND (v_current_hour >= 0 AND v_current_hour < 3) THEN
      PERFORM award_achievement(NEW.user_id, 'midnight_snack');
    END IF;
    
    -- Check sprinter (fast lesson - less than 5 minutes)
    IF NEW.time_spent IS NOT NULL AND NEW.time_spent < 5 THEN
      PERFORM award_achievement(NEW.user_id, 'sprinter');
    END IF;
    
    -- Check thoughtful (long lesson - more than 30 minutes)
    IF NEW.time_spent IS NOT NULL AND NEW.time_spent > 30 THEN
      PERFORM award_achievement(NEW.user_id, 'thoughtful');
    END IF;
    
    -- Get course for this lesson
    SELECT course_id INTO v_course_id FROM lessons WHERE id = NEW.lesson_id;
    
    IF v_course_id IS NOT NULL THEN
      -- Get total lessons in course
      SELECT COUNT(*) INTO v_total_lessons FROM lessons WHERE course_id = v_course_id;
      
      -- Get completed lessons in this course for this user
      SELECT COUNT(*) INTO v_course_completed_lessons
      FROM lesson_progress lp
      JOIN lessons l ON l.id = lp.lesson_id
      WHERE lp.user_id = NEW.user_id 
        AND l.course_id = v_course_id 
        AND lp.completed = true;
      
      IF v_total_lessons > 0 THEN
        v_course_progress := (v_course_completed_lessons * 100) / v_total_lessons;
        
        -- Check course progress achievements
        IF v_course_progress >= 50 THEN
          PERFORM award_achievement(NEW.user_id, 'halfway');
        END IF;
        
        IF v_course_progress >= 90 THEN
          PERFORM award_achievement(NEW.user_id, 'almost_there');
        END IF;
        
        IF v_course_progress >= 100 THEN
          PERFORM award_achievement(NEW.user_id, 'graduate');
        END IF;
      END IF;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function for test attempts
CREATE OR REPLACE FUNCTION public.check_test_achievements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test_count INTEGER;
  v_high_score_count INTEGER;
  v_previous_attempts INTEGER;
BEGIN
  -- Award "First test passed" achievement
  PERFORM award_achievement(NEW.user_id, 'first_blood');
  
  -- Check perfect score (100%)
  IF NEW.max_score > 0 AND NEW.score = NEW.max_score THEN
    PERFORM award_achievement(NEW.user_id, 'perfectionist');
  END IF;
  
  -- Check if this is a successful retake (had previous failed attempts)
  SELECT COUNT(*) INTO v_previous_attempts
  FROM test_attempts
  WHERE user_id = NEW.user_id 
    AND lesson_id = NEW.lesson_id 
    AND id != NEW.id
    AND score < max_score * 0.7; -- Previous attempts with score < 70%
  
  -- If had failed attempts before and this one is passing (>= 70%)
  IF v_previous_attempts > 0 AND NEW.max_score > 0 AND (NEW.score::float / NEW.max_score) >= 0.7 THEN
    PERFORM award_achievement(NEW.user_id, 'persistent');
  END IF;
  
  -- Count high score tests (>= 90%)
  SELECT COUNT(*) INTO v_high_score_count
  FROM test_attempts
  WHERE user_id = NEW.user_id 
    AND max_score > 0 
    AND (score::float / max_score) >= 0.9;
  
  IF v_high_score_count >= 10 THEN
    PERFORM award_achievement(NEW.user_id, 'test_terror');
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function for enrollments (course completion tracking)
CREATE OR REPLACE FUNCTION public.check_enrollment_achievements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_completed_courses INTEGER;
BEGIN
  -- Check if course was just completed
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    -- Award graduate achievement
    PERFORM award_achievement(NEW.user_id, 'graduate');
    
    -- Count total completed courses
    SELECT COUNT(*) INTO v_completed_courses
    FROM enrollments
    WHERE user_id = NEW.user_id AND status = 'completed';
    
    IF v_completed_courses >= 3 THEN
      PERFORM award_achievement(NEW.user_id, 'knowledge_collector');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function for user registration
CREATE OR REPLACE FUNCTION public.check_profile_achievements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Award "First step" achievement on profile creation
  PERFORM award_achievement(NEW.user_id, 'first_step');
  RETURN NEW;
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_lesson_achievements ON lesson_progress;
CREATE TRIGGER trigger_lesson_achievements
  AFTER INSERT OR UPDATE ON lesson_progress
  FOR EACH ROW
  EXECUTE FUNCTION check_lesson_achievements();

DROP TRIGGER IF EXISTS trigger_test_achievements ON test_attempts;
CREATE TRIGGER trigger_test_achievements
  AFTER INSERT ON test_attempts
  FOR EACH ROW
  EXECUTE FUNCTION check_test_achievements();

DROP TRIGGER IF EXISTS trigger_enrollment_achievements ON enrollments;
CREATE TRIGGER trigger_enrollment_achievements
  AFTER INSERT OR UPDATE ON enrollments
  FOR EACH ROW
  EXECUTE FUNCTION check_enrollment_achievements();

DROP TRIGGER IF EXISTS trigger_profile_achievements ON profiles;
CREATE TRIGGER trigger_profile_achievements
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION check_profile_achievements();