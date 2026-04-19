
## Вы абсолютно правы

Сейчас в редакторе показаны модели **Lovable AI** (Gemini 3 Flash и др.) — это движки для генерации текста. Голосовая интеграция **LiveKit Agents** — это совсем другая архитектура: связка **STT → LLM → TTS**, где у каждого блока свои провайдеры. И сейчас в комнате LiveKit ученик окажется один — никакого голосового агента там нет, это пока заглушка.

## Что предлагаю сделать правильно

### 1. Полноценные настройки под LiveKit Agents

Заменю «Модель ИИ» на три отдельных раздела:

**STT — распознавание речи ученика**
- Deepgram (`nova-2`, `nova-3`) — рекомендуется для русского
- OpenAI Whisper

**LLM — мозг преподавателя** (стримит ответ в реальном времени)
- OpenAI: `gpt-4o-mini` (рекомендуется), `gpt-4o`, `gpt-4.1`
- Google: `gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`
- Anthropic: `claude-3-5-sonnet`, `claude-3-5-haiku`
- Groq: `llama-3.3-70b` (минимальная задержка)

**TTS — голос аватара**
- ElevenLabs (лучшее качество русского, выбор голоса из библиотеки)
- OpenAI TTS (`alloy`, `echo`, `nova`, `shimmer`)
- Cartesia (низкая задержка)
- SaluteSpeech (ваш существующий — могу прикрутить)

**Язык диалога:** ru / en / es / de / fr / kz / uz...
**Поведение:** разрешать/запрещать перебивать, чувствительность VAD, задержка ответа.

### 2. База данных

Добавлю в `lessons` и `ai_avatar_templates`:
- `ai_avatar_stt_provider`, `ai_avatar_stt_model`
- `ai_avatar_llm_provider`, `ai_avatar_llm_model` (заменит текущее `ai_avatar_model`)
- `ai_avatar_tts_provider`, `ai_avatar_tts_voice`
- `ai_avatar_language` (default `ru`)
- `ai_avatar_allow_interruptions`

### 3. Передача конфига в LiveKit-комнату

`livekit-ai-tutor-start` будет класть всю конфигурацию в metadata комнаты:
```json
{ "stt": {"provider":"deepgram","model":"nova-2"},
  "llm": {"provider":"openai","model":"gpt-4o-mini"},
  "tts": {"provider":"elevenlabs","voice":"..."},
  "language": "ru", "systemPrompt": "...", "greeting": "..." }
```

### 4. Сам voice-агент LiveKit (важно!)

Это **отдельный постоянно работающий процесс** (Python/Node), который:
- подключается к LiveKit как worker
- получает конфиг из metadata комнаты
- собирает цепочку STT→LLM→TTS и ведёт диалог

**Lovable не может хостить такой процесс** — Edge Functions короткоживущие. Положу готовый код агента в репозиторий (`agents/tutor_agent.py`) с инструкцией по деплою на **Railway / Fly.io / LiveKit Cloud Agents**. Деплой делаете один раз — дальше всё работает автоматически.

### 5. Секреты

Для работы агента понадобятся ключи:
- `OPENAI_API_KEY` (для LLM/Whisper/TTS)
- `DEEPGRAM_API_KEY` (для STT)
- `ELEVENLABS_API_KEY` (для голоса)

Запрошу их через `add_secret` — добавите по мере необходимости. Для **минимального запуска** хватит OpenAI + Deepgram (всё голосом без ElevenLabs).

---

## Уточнение

Чтобы правильно собрать список провайдеров и не делать лишнюю работу, ответьте на 2 момента:

**A. Стек провайдеров в UI:**
1. Полный набор (Deepgram, Whisper, OpenAI, Gemini, Claude, Groq, ElevenLabs, Cartesia, OpenAI TTS, SaluteSpeech) — максимум выбора
2. Минимальный (Deepgram + OpenAI GPT-4o-mini + ElevenLabs) — рекомендуемая связка, без путаницы
3. Полный, но **SaluteSpeech по умолчанию** для TTS (раз он у вас уже подключён)

**B. Готовый код агента:**
1. Положить `agents/tutor_agent.py` в репозиторий + README с командой деплоя на Railway
2. Пока только UI и БД, агента подключим следующим шагом

После ответа — приступаю.
