
-- Add LiveKit Agents pipeline fields to lessons
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS ai_avatar_stt_provider text DEFAULT 'deepgram',
  ADD COLUMN IF NOT EXISTS ai_avatar_stt_model text DEFAULT 'nova-2',
  ADD COLUMN IF NOT EXISTS ai_avatar_llm_provider text DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS ai_avatar_llm_model text DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS ai_avatar_tts_provider text DEFAULT 'elevenlabs',
  ADD COLUMN IF NOT EXISTS ai_avatar_tts_voice text DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  ADD COLUMN IF NOT EXISTS ai_avatar_language text DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS ai_avatar_allow_interruptions boolean DEFAULT true;

-- Add LiveKit Agents pipeline fields to ai_avatar_templates
ALTER TABLE public.ai_avatar_templates
  ADD COLUMN IF NOT EXISTS stt_provider text DEFAULT 'deepgram',
  ADD COLUMN IF NOT EXISTS stt_model text DEFAULT 'nova-2',
  ADD COLUMN IF NOT EXISTS llm_provider text DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS llm_model text DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS tts_provider text DEFAULT 'elevenlabs',
  ADD COLUMN IF NOT EXISTS tts_voice text DEFAULT 'EXAVITQu4vr4xnSDxMaL',
  ADD COLUMN IF NOT EXISTS language text DEFAULT 'ru',
  ADD COLUMN IF NOT EXISTS allow_interruptions boolean DEFAULT true;
