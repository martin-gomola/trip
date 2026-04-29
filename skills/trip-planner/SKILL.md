---
name: trip-planner
description: Plan, save, deploy, and modify roadtrips in the local TRIP fork. Use when creating or updating trips, roadtrip itineraries, day plans, stops, places, Google-backed places, compact local TRIP API docs, TRIP configuration recovery, Docker health/logs, registration, backups, reverse proxy settings, code changes, or troubleshooting the configured public TRIP deployment.
---

# TRIP Planner

Use this skill from the TRIP app fork repo root.

## Quick Context

- App: local TRIP fork, a self-hosted POI map tracker and trip planner.
- Compose file: `docker-compose.yml`.
- Local deploy docs: `DEPLOYMENT.md` and `.env.example`.
- Runtime data: `${DATA_DIR}/trip/storage`, typically `$HOME/srv/docker/trip/storage` on macOS.
- Public URL: configured in local `.env` as `TRIP_BASE_URL`.
- Local port: `8050`.
- Roadtrip planner, API helper, and compact local docs: `skills/trip-planner/scripts/trip_api.py`.
- API notes: `skills/trip-planner/references/api.md`.
- Roadtrip workflow: `skills/trip-planner/references/roadtrip.md`.

## Safety Rules

- This fork is public and exists for the user's own TRIP server needs; optimize for that deployment over upstream-default neutrality.
- Treat `.env` and storage config as secrets. Do not print token values in chat and do not commit them.
- The API CLI is stateless for credentials: it reads `TRIP_API_TOKEN` from the environment or `.env`.
- Keep `REGISTER_ENABLE=false` unless the user explicitly wants a short registration window for a new account.
- Before every commit or push, run `scripts/scan_pii.sh --staged`, inspect the staged diff, and block the commit until secrets, home paths, DB files, env files, and private account details are removed.

## Common Workflow

1. Start from the repo root:

```bash
cd <repo-root>
```

2. Read the service docs before changing behavior:

```bash
sed -n '1,220p' README.md
sed -n '1,220p' DEPLOYMENT.md
sed -n '1,220p' docker-compose.yml
sed -n '1,220p' .env.example
```

3. Manage the service from the repo root:

```bash
docker compose up -d
docker compose ps
docker compose logs --tail=100 trip
```

4. Back up the storage directory before risky deploys or migrations:

```bash
tar -czf trip-backup-$(date +%Y%m%d-%H%M%S).tar.gz -C "${DATA_DIR:-/srv/docker}" trip/storage
```

## API Workflow

For trip planning, start with the roadtrip workflow and CLI:

```bash
skills/trip-planner/scripts/trip_api.py docs planning
skills/trip-planner/scripts/trip_api.py roadtrip template
skills/trip-planner/scripts/trip_api.py roadtrip validate @/tmp/roadtrip.json
skills/trip-planner/scripts/trip_api.py roadtrip dry-run @/tmp/roadtrip.json
skills/trip-planner/scripts/trip_api.py roadtrip apply @/tmp/roadtrip.json
skills/trip-planner/scripts/trip_api.py roadtrip show <trip-id>
```

Roadtrip creation uses TRIP's local container and SQLModel models because trip/day/item writes are not exposed by the by-token API. Use the by-token commands for standalone POIs. For API questions, start with the CLI docs before reading references or this fork's documentation site:

```bash
skills/trip-planner/scripts/trip_api.py docs brief
skills/trip-planner/scripts/trip_api.py docs endpoint place
skills/trip-planner/scripts/trip_api.py docs live
```

Use this fork's docs at `https://martin-gomola.github.io/trip/` when local docs do not answer the question. Treat this fork's code, local docs, and deployed docs as authoritative; do not route TRIP app questions to upstream docs. Use the CLI for by-token API work instead of ad hoc curl commands:

```bash
skills/trip-planner/scripts/trip_api.py config

skills/trip-planner/scripts/trip_api.py categories list

skills/trip-planner/scripts/trip_api.py place create \
  --category Culture \
  --name "British Museum" \
  --lat 51.5194133 \
  --lng -0.1269566 \
  --place "Great Russell St, London"

skills/trip-planner/scripts/trip_api.py place google-search \
  --query "British Museum" \
  --category Culture
```

The CLI defaults to `http://localhost:8050` and `.env`. Pass `--base-url "$TRIP_BASE_URL"` only when the configured public route matters. Before adding or changing API commands, run `docs brief` and read `references/api.md` only if more detail is needed. Current first-class commands cover all live by-token endpoints, and `raw` can call future token endpoints without printing secrets.

## Local Lessons

- Keep `skills/trip-planner/scripts/trip_api.py` aligned with the app's current planning model. If the UI adds item fields, the roadtrip import path should carry them too.
- Current roadtrip item fields include booking status/reference/cancel deadline, cost status, fees, duration, accommodation checkout day/time, and day start times.
- Use `trip_only: true` for sample or trip-specific places created from planning sessions so temporary stops and placeholder accommodations do not appear in the global Places screen.
- Accommodation convention: place price is price per night; itinerary item price is the full stay total; extra costs such as dog, cleaning, and tourist tax go in `fee_amount`/`fee_label`.
- Accommodation rows use `booking_status` for booking state. Leave generic item `status` empty unless it is a non-booking planning flag on a normal itinerary item.
- `roadtrip apply` should stay idempotent when the app retimes an item: match by day + exact time + text first, then by unique day + text before creating a new item.
- Itinerary order is currently time-driven. UI drag/drop reordering persists by moving item time slots within the same day, not by a separate sort-order column.
- Schedule math must reserve stop duration before the next activity. Prefer item-level `duration_minutes`, then place default `duration`, then zero.
- Always validate and dry-run before applying a generated trip. After applying an accommodation stay, verify `stay_checkout_day_id`, `stay_checkout_time`, `booking_status`, `cost_status`, and `fee_amount` survived the container write.
- For tour PDFs, extract text to a temporary file first and check whether the document is a detailed day programme or only a pre-trip dossier. If exact domestic/train times are missing, import them as `pending` placeholders with comments instead of inventing certainty.
- Avoid `place google-search` for bulk trip imports unless the user wants global places: it creates standalone places. Prefer explicit `places` with `trip_only: true` in the roadtrip JSON, then validate/dry-run/apply.
- Flight rows often cross time zones. Keep their visible `time` as the local airport departure time, put the arrival as its own local-time row, and do not let flight duration push the downstream local itinerary clock. Transit/waiting blocks after arrival can still use `duration_minutes`.
- Schedule fixes and retiming previews must never rewrite official ticket, booking, constraint, or transport times. If ETA math is wrong, show the warning or let the fixed row reset the chain to its printed time.

## Recovering `.env`

If `.env` is missing and the Docker container still exists, recover the expected values from container metadata instead of guessing. Preserve these fields when present:

- `DATA_DIR`
- `TRIP_VERSION`
- `TRIP_PORT`
- `TZ`
- `REGISTER_ENABLE`
- `TRIP_DOMAIN`
- `TRIP_BASE_URL`
- `DEFAULT_MAP_LAT`
- `DEFAULT_MAP_LNG`
- `TRIP_API_TOKEN`
- `MAPY_COM_API_KEY`

Recommended extraction shape:

```bash
docker inspect trip --format '{{range .Config.Env}}{{println .}}{{end}}'
```

Filter out base image values such as `PATH`, `LANG`, `GPG_KEY`, `PYTHON_VERSION`, and `PYTHON_SHA256`. Set the restored file to owner-only permissions:

```bash
chmod 600 .env
```

If the container is gone too, copy `.env.example` to `.env`, set `DATA_DIR=$HOME/srv/docker`, `TZ=Europe/Bratislava`, and ask the user before inventing tokens or SSO settings.

## Troubleshooting

- Health check target inside the container is `http://localhost:8000/`.
- Storage should be mounted at `/app/storage` in the container.
- Confirm the host bind mount with:

```bash
docker inspect trip --format '{{json .Mounts}}'
```

- For uploads larger than the default, update both `ATTACHMENT_MAX_SIZE` and the reverse proxy body size.
- If OIDC is configured later, all required `OIDC_*` values must be set together.
