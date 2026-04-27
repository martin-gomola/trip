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

## Image Enrichment via Wikipedia

When research returns a place that has a Wikipedia article, the article's lead image is usually a clean, license-safe photo. The TRIP server downloads and crops whatever URL is passed in `image`, so this is a deterministic way to populate the field without guessing CDN URLs.

```bash
curl -s "https://en.wikipedia.org/api/rest_v1/page/summary/ARTICLE_NAME" \
  -H "User-Agent: trip-planner/1.0"
```

Use the `originalimage.source` field from the JSON response as the `image` value on `POST /api/by_token/place`.

URL-encode non-ASCII characters in the article slug. Real examples:

- `Jerónimos_Monastery` → `Jer%C3%B3nimos_Monastery`
- `São_Jorge_Castle` → `S%C3%A3o_Jorge_Castle`
- `Praça_do_Comércio` → `Pra%C3%A7a_do_Com%C3%A9rcio`
- `Bratislavský_hrad` → `Bratislavsk%C3%BD_hrad`

If the article does not exist or has no `originalimage`, fall back to a related article (for example `Trams_in_Lisbon` instead of `Tram_28`) or skip the field.

## Google-Backed Place Creation

`POST /api/by_token/google-search`

Required JSON field:

- `q`, which can be a place name, a Google Maps place URL, or a `maps.app.goo.gl` short link.

Optional field:

- `category`, used when Google type mapping does not resolve to an existing category.

This requires both a TRIP API token and a Google API key configured on the TRIP account.

## Itinerary Time Semantics (UI-only fields)

The TRIP UI persists two fields used by the ETA chain. They are NOT exposed
through `by_token`; if a future session extends `trip_api.py` to manage
itinerary items, these are the names to use:

- `tripitem.duration_minutes` (int, 0–1440, nullable). Visit/stop duration at
  the place. The frontend uses it to advance the ETA clock past this row:
  `next_arrival = max(this_row_arrival, pinned_time) + duration_minutes +
  travel_to_next`. Not used for accommodation rows (those use
  `stay_checkout_*`).
- `tripday.day_start_time` ("HH:MM", nullable). On base-camp days (a stay
  in progress, not check-in or check-out day), this is the time the user
  leaves the accommodation in the morning. Default `09:00` when null.

Per-item `time` is a **target / pin**, not an anchor. The ETA engine computes
arrival from the chain (anchor → travel → duration → travel...) and only uses
`time` to display a `+Nm late` / `-Nm early` delta badge.

Day anchors used by the chain:

- Day 0 with `home` set → home coordinates, `day_start_time` else first item's
  `time` else `08:00`.
- Base-camp day → accommodation coordinates, `day_start_time` else `09:00`.
- Checkout day → the virtual checkout row carries the anchor inline
  (`stay_checkout_time` + accommodation coordinates).

## Credential Resolution

The CLI does not persist credentials. It reads `TRIP_API_TOKEN` from the process environment first, then from `.env` by default. It defaults to `http://localhost:8050` for local API work; pass `--base-url "$TRIP_BASE_URL"` when the configured public route is needed.

Useful commands:

```bash
skills/trip-planner/scripts/trip_api.py config
skills/trip-planner/scripts/trip_api.py --base-url "$TRIP_BASE_URL" categories list
skills/trip-planner/scripts/trip_api.py raw GET /api/by_token/categories
```
