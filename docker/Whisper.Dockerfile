FROM python:3.11-slim-bookworm@sha256:0a310eeecf4e1f5a0743f9a6520c90c88d089c903ca5fd283f501e3a805f5f89
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 ASR_HOST=0.0.0.0 ASR_PORT=4180 ASR_PUNCTUATION=0
ENV HF_HOME=/app/data/models/.cache HF_HUB_DISABLE_XET=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements-asr.txt .
RUN pip install --no-cache-dir -r requirements-asr.txt && useradd --uid 10001 --create-home whisper && mkdir -p /app/data/models && chown -R whisper:whisper /app/data
COPY requirements-translation.txt .
RUN pip install --no-cache-dir -r requirements-translation.txt
COPY asr_server.py translation_engine.py translation-models.json ./
USER whisper
EXPOSE 4180
CMD ["python", "asr_server.py"]
