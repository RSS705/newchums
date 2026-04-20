#!/usr/bin/env python3
"""
PostToolUse hook: enforce AGENTS.md "no em dashes" rule.

Reads Claude Code's tool-call JSON on stdin, and if the edited file is a
user-facing source or docs file in this repo, scans it for em dashes
(U+2014 literal, \\u2014, or HTML &mdash;). Any match blocks the tool
call so Claude must fix it before proceeding.

Scope (matches on the file's absolute path ending):
  - web/src/**/*.{ts,tsx,js,jsx}
  - api/src/**/*.ts
  - docs/**/*.md
  - AGENTS.md (repo root)
  - README.md (repo root)
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Path patterns relative to a repo root that ends in "/NewChums/".
PATH_RE = re.compile(
    r"/NewChums/("
    r"web/src/.+\.(ts|tsx|js|jsx)"
    r"|api/src/.+\.ts"
    r"|docs/.+\.md"
    r"|AGENTS\.md"
    r"|README\.md"
    r")$"
)

# Matches a literal em dash, an escaped \u2014, or an &mdash; HTML entity.
EM_DASH_RE = re.compile(r"\u2014|\\u2014|&mdash;")


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    tool_input = payload.get("tool_input") or {}
    tool_response = payload.get("tool_response") or {}
    file_path = (
        tool_input.get("file_path")
        or tool_response.get("filePath")
        or ""
    )
    if not file_path or not PATH_RE.search(file_path):
        return 0

    path = Path(file_path)
    if not path.is_file():
        return 0

    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return 0

    hits = [
        f"{i}: {line}" for i, line in enumerate(lines, 1) if EM_DASH_RE.search(line)
    ]
    if not hits:
        return 0

    reason = (
        "AGENTS.md copy rule violation: em dashes are banned in user-facing "
        "text, helper text, email templates, and documentation. Replace each "
        "em dash with a comma, period, or semicolon, then re-save.\n\n"
        f"File: {file_path}\n"
        + "\n".join(hits)
    )
    json.dump({"decision": "block", "reason": reason}, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
