"""Public, non-sensitive identity of the Budgy backend release.

Do not trust the legacy Coolify APP_VERSION environment variable as the
source of truth. A stale value (such as 3.7.29) must never mask code 4.0.0.

BUDGY_GIT_SHA must be supplied from the *pinned* Git commit at build time.
When it cannot be verified, report "unknown", not a fabricated SHA.
"""
from __future__ import annotations

import os
import re

APP_VERSION = "4.0.0"
_SHA40 = re.compile(r"^[0-9a-f]{40}$")


def deployed_git_sha() -> str:
    candidate = (os.getenv("BUDGY_GIT_SHA") or "").strip().lower()
    return candidate if _SHA40.fullmatch(candidate) else "unknown"
