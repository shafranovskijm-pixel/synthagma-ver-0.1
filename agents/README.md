# Sintagma — LiveKit AI Tutor Agent

Внешний воркер, который превращает пустую LiveKit-комнату в полноценного
голосового ИИ-преподавателя. Подключается к LiveKit, читает настройки урока
из `room.metadata` и запускает цепочку **STT → LLM → TTS**.

> Lovable не может хостить такой воркер сам — Edge Functions короткоживущие.
> Этот воркер — **отдельный постоянный процесс**. Деплой делается один раз,
> дальше всё работает автоматически для всех уроков.

---

## Что вам понадобится

1. Аккаунт на хостинге процессов (любой):
   - **Railway** (проще всего) — railway.app
   - **Fly.io** — fly.io
   - **Render** — render.com
   - VPS с Docker

2. API-ключи провайдеров (минимальный комплект):
   - **LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL** — те же, что в Lovable Cloud
   - **OPENAI_API_KEY** — для LLM (GPT-4o-mini) и/или TTS
   - **DEEPGRAM_API_KEY** — для распознавания речи (рекомендуется для русского)
   - **ELEVENLABS_API_KEY** — для голоса (рекомендуется для русского)

   Опционально (включайте только если выбрали этих провайдеров в редакторе урока):
   `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `GOOGLE_API_KEY`, `CARTESIA_API_KEY`.

---

## Локальный запуск (для теста)

```bash
cd agents
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export LIVEKIT_URL="wss://your-project.livekit.cloud"
export LIVEKIT_API_KEY="..."
export LIVEKIT_API_SECRET="..."
export OPENAI_API_KEY="sk-..."
export DEEPGRAM_API_KEY="..."
export ELEVENLABS_API_KEY="..."

python tutor_agent.py dev
```

Воркер выведет в логи:
```
registered worker id=... region=...
```

Откройте урок типа «ИИ-аватар» в кабинете ученика — воркер автоматически
подключится к комнате и поприветствует студента.

---

## Деплой на Railway (рекомендуется)

1. Создайте новый проект → **"Deploy from GitHub repo"** → выберите ваш репозиторий
2. В настройках сервиса:
   - **Root directory**: `agents`
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `python tutor_agent.py start`
3. В разделе **Variables** добавьте все ENV-переменные из списка выше
4. Нажмите **Deploy**

Через 1-2 минуты воркер будет в логах и готов принимать комнаты.

---

## Деплой на Fly.io

Создайте `agents/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY tutor_agent.py .
CMD ["python", "tutor_agent.py", "start"]
```

Затем:
```bash
cd agents
fly launch --no-deploy
fly secrets set LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
              OPENAI_API_KEY=... DEEPGRAM_API_KEY=... ELEVENLABS_API_KEY=...
fly deploy
```

---

## Как это работает

1. Пользователь нажимает «Начать урок» → frontend вызывает edge-функцию
   `livekit-ai-tutor-start`
2. Функция создаёт LiveKit-комнату с метаданными:
   ```json
   {
     "kind": "ai-tutor",
     "tutor": {
       "name": "Анна Петровна",
       "language": "ru",
       "systemPrompt": "...",
       "greeting": "Здравствуйте, я ...",
       "stt": { "provider": "deepgram", "model": "nova-2" },
       "llm": { "provider": "openai",   "model": "gpt-4o-mini" },
       "tts": { "provider": "elevenlabs", "voice": "EXAVITQu4vr4xnSDxMaL" },
       "allowInterruptions": true
     }
   }
   ```
3. Воркер ловит новую комнату, читает `metadata.tutor`, собирает цепочку
   **STT → LLM → TTS** и присоединяется к комнате как участник
4. Студент слышит приветствие и может вести разговор голосом

---

## Поддерживаемые провайдеры

| Стадия | Провайдеры |
|--------|------------|
| **STT** | Deepgram (`nova-2`, `nova-3`), OpenAI Whisper, Google Speech-to-Text |
| **LLM** | OpenAI (GPT-4o, GPT-4o-mini, GPT-4.1), Anthropic (Claude 3.5), Google (Gemini 2.0/2.5), Groq (Llama 3.3) |
| **TTS** | ElevenLabs, OpenAI TTS, Cartesia, SaluteSpeech (fallback на ElevenLabs — нет официального плагина) |

Чтобы добавить нового провайдера — установите соответствующий
`livekit-plugins-*` пакет и расширьте функции `make_stt` / `make_llm` / `make_tts`
в `tutor_agent.py`.

---

## Безопасность

- Воркер использует только серверные ключи провайдеров — они **никогда** не
  попадают на клиент.
- LIVEKIT_API_SECRET даёт право создавать комнаты — храните только в ENV.
- Если в комнате нет студента >60 сек, она автоматически закрывается
  (`empty_timeout` в edge-функции).
- Месячный лимит — 1000 минут (LiveKit Cloud Free tier) — проверяется в edge-функции.

---

## Траблшутинг

- **«Worker не подключается к комнате»** — проверьте `LIVEKIT_URL` (должен начинаться с `wss://`)
  и пара ключ/секрет.
- **«Аватар молчит после приветствия»** — проверьте `OPENAI_API_KEY` и наличие
  средств на балансе провайдера.
- **«Распознаёт речь, но не отвечает»** — посмотрите логи воркера, обычно это
  ошибка LLM-провайдера (rate limit, неверная модель).
- **«Голос звучит как робот»** — переключите TTS на ElevenLabs `eleven_turbo_v2_5`
  — лучшее качество русского.
