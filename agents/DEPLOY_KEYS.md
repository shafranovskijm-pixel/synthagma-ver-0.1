# Где взять ключи для голосового ИИ-преподавателя

Воркеру `tutor_agent.py` нужно 3 набора ключей. Минимально — только `LIVEKIT_*`
+ один LLM-провайдер. Остальные включаете по мере того, как выбираете
провайдеров в редакторе урока.

---

## 1. LiveKit (обязательно — у вас уже есть)

Те же значения, что используются в Lovable Cloud секретах:

```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxx
LIVEKIT_API_SECRET=secret...
```

Где взять: https://cloud.livekit.io → ваш проект → **Settings → Keys**.

> ⚠️ Это серверные ключи. Никогда не публикуйте `LIVEKIT_API_SECRET` на фронте.

---

## 2. OpenAI — для LLM, Whisper STT и/или OpenAI TTS

```
OPENAI_API_KEY=sk-proj-...
```

1. https://platform.openai.com/api-keys
2. **Create new secret key** → выберите все scopes (или только `model.request`,
   `audio.read`, `audio.write` для минимальных прав)
3. Пополните баланс минимум на 5$ — gpt-4o-mini стоит ~0.15$ за 1M токенов

Что использовать в редакторе урока:
- **LLM**: `gpt-4o-mini` (рекомендуется, баланс цена/качество для русского)
- **STT**: OpenAI Whisper `whisper-1` — если не хотите Deepgram
- **TTS**: голоса `alloy`, `nova`, `shimmer`, `echo` — если не хотите ElevenLabs

---

## 3. Deepgram — рекомендованный STT для русского

```
DEEPGRAM_API_KEY=...
```

1. https://console.deepgram.com/signup — бесплатно даёт **200$ кредитов**
   (хватит на ~750 часов распознавания)
2. **API Keys → Create a New API Key** → role `Member`, scope `usage:write`

Модели в редакторе урока:
- `nova-2` — рекомендуется (лучшее качество русского)
- `nova-3` — новейшая, чуть дороже

---

## 4. ElevenLabs — лучший TTS для русского

```
ELEVENLABS_API_KEY=sk_...
```

1. https://elevenlabs.io/app/settings/api-keys
2. **Create API Key** → permissions `Text to Speech` + `Voices: Read`
3. Бесплатный план — 10 000 символов/мес, $5 = 30 000 символов

Где взять `voiceId` для редактора урока:
- https://elevenlabs.io/app/voice-library — выберите голос → **Add to VoiceLab**
- или https://elevenlabs.io/app/voice-lab — **Voice ID** в карточке голоса
- Дефолтный пример (Rachel): `EXAVITQu4vr4xnSDxMaL`

Рекомендую модель `eleven_turbo_v2_5` (быстрая + русский) — она уже зашита
в `tutor_agent.py`.

---

## 5. Опциональные провайдеры

Включайте только если выбрали их в редакторе урока:

| ENV | Провайдер | Где взять |
|-----|-----------|-----------|
| `ANTHROPIC_API_KEY` | Claude 3.5 Sonnet/Haiku | https://console.anthropic.com/settings/keys |
| `GROQ_API_KEY` | Llama 3.3 70B (минимальная задержка) | https://console.groq.com/keys |
| `GOOGLE_API_KEY` | Gemini 2.0/2.5 Flash/Pro | https://aistudio.google.com/apikey |
| `CARTESIA_API_KEY` | Cartesia TTS (низкая задержка) | https://play.cartesia.ai/keys |

---

## Проверка — все ли ключи на месте

После деплоя смотрите логи воркера. При успешной регистрации увидите:

```
INFO:livekit.agents:registered worker id=AW_xxx region=...
INFO:sintagma-tutor:Starting tutor session in room=ai-tutor-... lang=ru tutor=...
```

Если в логах:
- `401 Unauthorized` — неверный ключ провайдера, перепроверьте копипаст
- `Insufficient quota` — пополните баланс OpenAI / ElevenLabs
- `Worker doesn't pick rooms` — проверьте `LIVEKIT_URL` (должен начинаться с `wss://`)
