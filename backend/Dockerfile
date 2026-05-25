# ───────────────────────────────────────────────────────────────
# BUDGY API — Production Dockerfile (Coolify / any container host)
#
# • Python 3.11 slim base
# • Multi-stage to keep the final image small
# • Runs as a non-root user
# • Listens on 0.0.0.0:8000 (overridable via $PORT)
# • Built-in HEALTHCHECK against GET /health
# ───────────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

# System deps required by some wheels (cryptography, bcrypt, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        libffi-dev \
        libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip wheel setuptools \
    && pip wheel --wheel-dir=/wheels -r requirements.txt

# ───────────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000 \
    HOST=0.0.0.0 \
    APP_ENV=production \
    LOG_LEVEL=INFO

# curl for the HEALTHCHECK; ca-certificates for outbound HTTPS calls
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system --gid 1001 budgy \
    && useradd --system --uid 1001 --gid budgy --home /app --shell /bin/bash budgy

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements.txt ./
RUN pip install --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

# Application code
COPY --chown=budgy:budgy . /app

USER budgy

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/health" || exit 1

# Single worker keeps the in-memory chat sessions consistent. Scale
# horizontally via additional containers behind the Coolify proxy if needed.
CMD ["sh", "-c", "uvicorn server:app --host ${HOST:-0.0.0.0} --port ${PORT:-8000} --workers 1 --proxy-headers --forwarded-allow-ips=*"]
