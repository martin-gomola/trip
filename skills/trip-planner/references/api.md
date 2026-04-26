# TRIP API Notes

Use this reference when calling or extending the TRIP by-token API helper.

## Agent Context Budget

Do not start with web research for normal TRIP API work. Run the compact local catalog first:

```bash
skills/trip-planner/scripts/trip_api.py docs brief
skills/trip-planner/scripts/trip_api.py docs endpoint google-search
skills/trip-planner/scripts/trip_api.py docs live
```

Browse upstream docs only when the user asks for latest upstream behavior, the compact catalog is missing an answer, or `docs live` reports drift from the running app.

## Sources

- Official API key docs: `https://itskovacs.github.io/trip/docs/trip-api/generating-api-key/`
- Official place creation docs: `https://itskovacs.github.io/trip/docs/trip-api/place-creation/`
- Official Google search creation docs: `https://itskovacs.github.io/trip/docs/trip-api/place-google-search/`

## Authentication

TRIP by-token endpoints use the `X-Api-Token` request header. The token is generated from the TRIP settings UI and impersonates the user for supported tasks. Do not print the token in logs or chat.

## Current By-Token Endpoints

These endpoints are present in the running local app's OpenAPI schema:

| Method | Path | CLI |
| --- | --- | --- |
| `GET` | `/api/by_token/categories` | `trip_api.py categories list` |
| `POST` | `/api/by_token/place` | `trip_api.py place create` |
| `POST` | `/api/by_token/google-search` | `trip_api.py place google-search` |

The official docs currently document place creation and Google-backed place creation. The categories endpoint is useful for checking exact category names before creating a place.

## Place Creation

`POST /api/by_token/place`

Required JSON fields:

- `category`, exact case-sensitive category name.
- `name`.
- `lat`.
- `lng`.
- `place`, a human-readable location string.

Optional fields supported by the running app:

- `image`, URL or base64 image.
- `allowdog`.
- `description`.
- `price`.
- `duration`.
- `favorite`.
- `visited`.
- `gpx`.
- `restroom`.

## Google-Backed Place Creation

`POST /api/by_token/google-search`

Required JSON field:

- `q`, which can be a place name, a Google Maps place URL, or a `maps.app.goo.gl` short link.

Optional field:

- `category`, used when Google type mapping does not resolve to an existing category.

This requires both a TRIP API token and a Google API key configured on the TRIP account.

## Credential Resolution

The CLI does not persist credentials. It reads `TRIP_API_TOKEN` from the process environment first, then from `.env` by default. It defaults to `http://localhost:8050` for local API work; pass `--base-url "$TRIP_BASE_URL"` when the configured public route is needed.

Useful commands:

```bash
skills/trip-planner/scripts/trip_api.py config
skills/trip-planner/scripts/trip_api.py --base-url "$TRIP_BASE_URL" categories list
skills/trip-planner/scripts/trip_api.py raw GET /api/by_token/categories
```
