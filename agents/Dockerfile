FROM python:3.11-slim

WORKDIR /app

# System deps for audio processing (silero VAD uses onnxruntime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY tutor_agent.py .

# LiveKit Agents worker keeps an outbound WebSocket to LiveKit Cloud — no inbound port required
CMD ["python", "tutor_agent.py", "start"]
