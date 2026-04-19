"""
Sintagma — LiveKit AI Tutor Agent
==================================

This is a stand-alone LiveKit Agents worker that joins any room created by the
`livekit-ai-tutor-start` edge function and runs a real-time STT → LLM → TTS
pipeline based on the configuration stored in the room's metadata.

Deploy this worker once on Railway / Fly.io / Render / a VPS. It will keep
running, accept new rooms automatically, and disconnect when the student leaves.

Quick start
-----------
1. Install Python 3.11+
2. pip install -r requirements.txt
3. Set environment variables (see README.md)
4. python tutor_agent.py dev   # local
   python tutor_agent.py start # production worker

Environment variables (required)
--------------------------------
- LIVEKIT_URL           — wss://... (same as LIVEKIT_WS_URL in Lovable Cloud)
- LIVEKIT_API_KEY       — same as in Lovable Cloud
- LIVEKIT_API_SECRET    — same as in Lovable Cloud
- OPENAI_API_KEY        — for LLM/Whisper/OpenAI TTS
- DEEPGRAM_API_KEY      — for STT (recommended)
- ELEVENLABS_API_KEY    — for TTS (recommended for Russian)

Optional (only if used by tutor configs):
- ANTHROPIC_API_KEY, GROQ_API_KEY, GOOGLE_API_KEY, CARTESIA_API_KEY
"""

import asyncio
import json
import logging
from typing import Any

from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    WorkerOptions,
    cli,
)
from livekit.plugins import (
    openai,
    deepgram,
    elevenlabs,
    silero,
)

# Optional plugins — imported lazily so missing keys don't crash the worker
try:
    from livekit.plugins import anthropic  # type: ignore
except Exception:
    anthropic = None  # type: ignore
try:
    from livekit.plugins import groq  # type: ignore
except Exception:
    groq = None  # type: ignore
try:
    from livekit.plugins import google as google_plugin  # type: ignore
except Exception:
    google_plugin = None  # type: ignore
try:
    from livekit.plugins import cartesia  # type: ignore
except Exception:
    cartesia = None  # type: ignore

logger = logging.getLogger("sintagma-tutor")
logging.basicConfig(level=logging.INFO)


# ---------- Pipeline factories ----------

def make_stt(cfg: dict, language: str):
    provider = (cfg or {}).get("provider", "deepgram")
    model = (cfg or {}).get("model", "nova-2")
    if provider == "deepgram":
        return deepgram.STT(model=model, language=language)
    if provider == "openai":
        return openai.STT(model=model)
    if provider == "google" and google_plugin:
        return google_plugin.STT(model=model, languages=[language])
    logger.warning("Unknown STT provider %s, falling back to Deepgram nova-2", provider)
    return deepgram.STT(model="nova-2", language=language)


def make_llm(cfg: dict):
    provider = (cfg or {}).get("provider", "openai")
    model = (cfg or {}).get("model", "gpt-4o-mini")
    if provider == "openai":
        return openai.LLM(model=model)
    if provider == "anthropic" and anthropic:
        return anthropic.LLM(model=model)
    if provider == "groq" and groq:
        return groq.LLM(model=model)
    if provider == "google" and google_plugin:
        return google_plugin.LLM(model=model)
    logger.warning("Unknown LLM provider %s, falling back to OpenAI gpt-4o-mini", provider)
    return openai.LLM(model="gpt-4o-mini")


def make_tts(cfg: dict, language: str):
    provider = (cfg or {}).get("provider", "elevenlabs")
    voice = (cfg or {}).get("voice", "EXAVITQu4vr4xnSDxMaL")
    if provider == "elevenlabs":
        return elevenlabs.TTS(voice=elevenlabs.Voice(id=voice, name="custom", category="custom"),
                              model="eleven_turbo_v2_5", language=language)
    if provider == "openai":
        return openai.TTS(voice=voice, model="tts-1")
    if provider == "cartesia" and cartesia:
        return cartesia.TTS(voice=voice, language=language)
    if provider == "salutespeech":
        # SaluteSpeech не имеет официального LiveKit-плагина — fallback на ElevenLabs.
        # Для production переключите TTS-провайдер в настройках урока на ElevenLabs/OpenAI.
        logger.warning("SaluteSpeech is not supported by LiveKit Agents directly — using ElevenLabs fallback")
        return elevenlabs.TTS(voice=elevenlabs.Voice(id="EXAVITQu4vr4xnSDxMaL", name="fallback", category="custom"),
                              model="eleven_turbo_v2_5", language=language)
    logger.warning("Unknown TTS provider %s, falling back to ElevenLabs", provider)
    return elevenlabs.TTS(voice=elevenlabs.Voice(id=voice, name="custom", category="custom"),
                          model="eleven_turbo_v2_5", language=language)


# ---------- Tutor Agent ----------

class TutorAgent(Agent):
    def __init__(self, system_prompt: str, name: str, subject: str):
        full_prompt = system_prompt or (
            f"Ты — преподаватель {name or ''} по теме «{subject or 'общие знания'}». "
            "Отвечай дружелюбно, кратко и по делу. Задавай контрольные вопросы, "
            "проверяй понимание ученика, говори простым языком."
        )
        super().__init__(instructions=full_prompt)


# ---------- Entrypoint ----------

async def entrypoint(ctx: JobContext):
    await ctx.connect()

    # Parse room metadata set by livekit-ai-tutor-start edge function
    raw_meta = ctx.room.metadata or "{}"
    try:
        meta: dict[str, Any] = json.loads(raw_meta)
    except Exception:
        logger.exception("Failed to parse room metadata: %s", raw_meta)
        meta = {}

    if meta.get("kind") != "ai-tutor":
        logger.info("Room %s is not an ai-tutor room (kind=%s) — skipping",
                    ctx.room.name, meta.get("kind"))
        return

    tutor = meta.get("tutor") or {}
    language = tutor.get("language", "ru")
    name = tutor.get("name") or "Преподаватель"
    subject = tutor.get("subject") or meta.get("topic") or ""
    greeting = tutor.get("greeting") or f"Здравствуйте! Меня зовут {name}. Готов начать занятие."
    allow_interruptions = bool(tutor.get("allowInterruptions", True))

    logger.info("Starting tutor session in room=%s lang=%s tutor=%s subject=%s",
                ctx.room.name, language, name, subject)
    logger.info("Pipeline: STT=%s LLM=%s TTS=%s",
                tutor.get("stt"), tutor.get("llm"), tutor.get("tts"))

    session = AgentSession(
        stt=make_stt(tutor.get("stt") or {}, language),
        llm=make_llm(tutor.get("llm") or {}),
        tts=make_tts(tutor.get("tts") or {}, language),
        vad=silero.VAD.load(),
        allow_interruptions=allow_interruptions,
    )

    agent = TutorAgent(
        system_prompt=tutor.get("systemPrompt") or "",
        name=name,
        subject=subject,
    )

    await session.start(agent=agent, room=ctx.room)

    # Greet the student
    await session.say(greeting, allow_interruptions=allow_interruptions)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
