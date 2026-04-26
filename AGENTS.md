# Agent Instructions

This repository is the user's public TRIP fork for their own server deployment.
Optimize changes for that deployment and future local app modifications; do not
treat this as a neutral upstream checkout where preserving upstream defaults is
the main goal.

## Public Repo Safety

- This repo is public. Never commit secrets, real tokens, `.env`, SQLite data,
  backups, local storage, private account details, or real auth material.
- Avoid committing machine-specific home paths or private deployment details
  unless the user explicitly asks for them and they are safe to publish.
- Before every commit or push, run a PII/secret scan and inspect the staged diff:

```bash
scripts/scan_pii.sh --staged
git diff --cached --check
git diff --cached
```

- If the local scanner is unavailable, use an equivalent manual scan for tokens,
  private keys, email addresses, home paths, databases, and env files before
  committing.

## TRIP Deployment Context

- Real runtime configuration is local `.env`; it must stay ignored.
- Use `docker-compose.yml` from this fork for local deploy/build work.
- Use `skills/trip-planner/scripts/trip_api.py` for TRIP API and roadtrip work.
- Keep changes practical for the user's hosted TRIP instance, even when that
  means diverging from upstream defaults.
