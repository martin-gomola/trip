#!/usr/bin/env python3
"""Authenticate an agent-browser session for local TRIP UI review."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def read_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        raise SystemExit(f"Missing private env file: {path}")

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def login(base_url: str, username: str, password: str) -> dict[str, str]:
    url = base_url.rstrip("/") + "/api/auth/login"
    request = urllib.request.Request(
        url,
        data=json.dumps({"username": username, "password": password}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"TRIP login failed with HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"TRIP login failed: {exc.reason}") from exc

    if "pending_code" in payload:
        raise SystemExit("TRIP login requires TOTP; browser auth script cannot complete automatically.")
    if "access_token" not in payload or "refresh_token" not in payload:
        raise SystemExit("TRIP login response did not include access and refresh tokens.")
    return payload


def run_agent_browser(session_name: str, *args: str) -> None:
    cmd = ["agent-browser", "--session-name", session_name, *args]
    result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        message = result.stderr.strip() or "agent-browser command failed"
        raise SystemExit(message)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:4200", help="Frontend origin used for localStorage")
    parser.add_argument("--session-name", default="trip-ui-review", help="agent-browser session name")
    parser.add_argument("--env-file", default=str(repo_root() / ".env"), help="Private env file path")
    args = parser.parse_args()

    env = read_env(Path(args.env_file))
    username = env.get("TRIP_ADMIN_USERNAME")
    password = env.get("TRIP_ADMIN_PASSWORD")
    if not username or not password:
        raise SystemExit("Missing TRIP_ADMIN_USERNAME or TRIP_ADMIN_PASSWORD in private .env")

    tokens = login(args.base_url, username, password)

    run_agent_browser(args.session_name, "open", args.base_url.rstrip("/") + "/")
    run_agent_browser(args.session_name, "storage", "local", "set", "TRIP_USER", username)
    run_agent_browser(args.session_name, "storage", "local", "set", "TRIP_AT", tokens["access_token"])
    run_agent_browser(args.session_name, "storage", "local", "set", "TRIP_RT", tokens["refresh_token"])

    print(f"Authenticated agent-browser session '{args.session_name}' for {args.base_url.rstrip('/')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
