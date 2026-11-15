"""Safe environment-presence diagnostics for the EXISTING Budgy backend.

Only the words "defined" and "missing" are returned. Never return or
log variable values, private keys, tokens, URLs or certificate contents.

"required" is feature-specific: Apple variables are NOT required for a
public health check; they ARE required for Apple subscription validation.
"""
from __future__ import annotations

import os
from typing import Dict, Tuple

# Environment variable names, in preference order, never secret values.
# Core Supabase URL should explicitly point to the existing self-hosted
# instance; checking its actual hostname requires an operator-only review.
ENV_REQUIREMENTS: Dict[str, Dict[str, Tuple[str, ...]]] = {
    "core": {
        "SUPABASE_URL": ("SUPABASE_URL",),
    },
    "ai_ocr": {
        # OpenAI is the configured production provider for Budgy.
        "OPENAI_API_KEY": ("OPENAI_API_KEY",),
    },
    "subscription_storage": {
        "SUPABASE_SERVICE_ROLE_KEY": ("SUPABASE_SERVICE_ROLE_KEY",),
    },
    "apple_iap": {
        "APPLE_BUNDLE_ID": ("APPLE_BUNDLE_ID",),
        "APPLE_ISSUER_ID": ("APPLE_ISSUER_ID",),
        "APPLE_KEY_ID": ("APPLE_KEY_ID",),
        "APPLE_PRIVATE_KEY_P8": ("APPLE_PRIVATE_KEY_P8", "APPLE_PRIVATE_KEY"),
        "APPLE_PRODUCT_ID_MONTHLY": (
            "APPLE_PRODUCT_ID_MONTHLY", "APPLE_PRODUCT_MONTHLY", "IAP_PRODUCT_MONTHLY",
        ),
        "APPLE_PRODUCT_ID_YEARLY": (
            "APPLE_PRODUCT_ID_YEARLY", "APPLE_PRODUCT_YEARLY",
            "APPLE_PRODUCT_ID_ANNUAL", "APPLE_PRODUCT_ANNUAL",
            "IAP_PRODUCT_YEARLY", "IAP_PRODUCT_ANNUAL",
        ),
    },
}

# Optional controls: the existing code has safe defaults or the feature is
# not universally required in a minimal API deployment.
ENV_OPTIONAL: Dict[str, Tuple[str, ...]] = {
    "APP_ENV": ("APP_ENV",),
    "APP_VERSION": ("APP_VERSION",),  # legacy: ignored for release identity
    "BUDGY_GIT_SHA": ("BUDGY_GIT_SHA",),
    "LOG_LEVEL": ("LOG_LEVEL",),
    "HOST": ("HOST",),
    "PORT": ("PORT",),
    "CORS_ALLOWED_ORIGINS": ("CORS_ALLOWED_ORIGINS",),
    "CORS_ALLOWED_ORIGIN_REGEX": ("CORS_ALLOWED_ORIGIN_REGEX",),
    "LLM_PROVIDER": ("LLM_PROVIDER",),
    "LLM_MODEL": ("LLM_MODEL",),
    "LLM_MODEL_CHAT": ("LLM_MODEL_CHAT",),
    "LLM_MODEL_FAST": ("LLM_MODEL_FAST",),
    "LLM_TIMEOUT_SECONDS": ("LLM_TIMEOUT_SECONDS",),
    "ANTHROPIC_API_KEY": ("ANTHROPIC_API_KEY",),
    "GEMINI_API_KEY": ("GEMINI_API_KEY", "GOOGLE_API_KEY"),
    "AZURE_OPENAI_API_KEY": ("AZURE_OPENAI_API_KEY", "AZURE_API_KEY"),
    "EMERGENT_LLM_KEY": ("EMERGENT_LLM_KEY",),  # legacy fallback only
    "SUPABASE_JWT_AUD": ("SUPABASE_JWT_AUD",),
    "SUPABASE_JWT_ISS": ("SUPABASE_JWT_ISS",),
    "SUPABASE_JWT_ALLOW_HS256_FALLBACK": ("SUPABASE_JWT_ALLOW_HS256_FALLBACK",),
    "SUPABASE_JWT_SECRET": ("SUPABASE_JWT_SECRET",),  # only if HS256 enabled
    "APPLE_USE_SANDBOX": ("APPLE_USE_SANDBOX",),
    "APPLE_APP_APPLE_ID": ("APPLE_APP_APPLE_ID",),
    "APPLE_SHARED_SECRET": ("APPLE_SHARED_SECRET",),
    "IAP_WEBHOOK_SECRET": ("IAP_WEBHOOK_SECRET",),
}


def _present(names: Tuple[str, ...]) -> str:
    return "defined" if any((os.getenv(name) or "").strip() for name in names) else "missing"


def readiness_report() -> dict:
    """Return states only: no actual environment variable values."""
    return {
        "required_by_feature": {
            group: {logical_name: _present(names) for logical_name, names in keys.items()}
            for group, keys in ENV_REQUIREMENTS.items()
        },
        "optional": {
            name: _present(names) for name, names in ENV_OPTIONAL.items()
        },
    }
