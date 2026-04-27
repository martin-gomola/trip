---
name: mapy-com
description: Make Mapy.com integration decisions for TRIP and other apps. Use when adding Mapy.com or Mapy.cz URLs, QR codes, offline-map handoff, routing links, map tiles, geocoding, route planning, or when choosing between free Mapy URL schemes and Mapy REST API endpoints. Triggers on Mapy.com, Mapy.cz, mapycom/developer, offline maps, QR map links, showmap, route URL, and Mapy API.
---

# Mapy.com Integration

Use this skill for Mapy.com-specific URL/API decisions. For TRIP app changes, also use the `trip-planner` skill.

## Documentation Sources

Prefer official Mapy.com docs:

- AI index: `https://raw.githubusercontent.com/mapycom/developer/master/llms.txt`
- GitHub docs mirror: `https://github.com/mapycom/developer`
- URL schemes: `https://developer.mapy.com/further-uses-of-mapycz/mapy-cz-url/`
- REST API hub: `https://api.mapy.com/v1/docs/`

Read only the relevant page or section for the task. Use URL-scheme docs for QR/open-app behavior. Use REST/OpenAPI docs only when the app needs data from Mapy, such as geocoding, route calculations, tiles, elevation, or static images.

## Decision Rules

- For printed QR codes, mobile handoff, and "open this point in Mapy.com", use the free URL scheme. It does not require an API key.
- For exact point QR codes, prefer `/showmap`:

```text
https://mapy.com/fnc/v1/showmap?mapset=outdoor&center={lng},{lat}&zoom=16&marker=true
```

- For route handoff, use `/route` and set `routeType` intentionally:

```text
https://mapy.com/fnc/v1/route?mapset=outdoor&start={lng},{lat}&end={lng},{lat}&routeType=car_fast&navigate=true
```

- For search handoff from text, use `/search` with an encoded `query`. Add `center={lng},{lat}` only when a nearby search bias is useful.
- For server-side address lookup, route duration, matrices, tiles, static maps, panorama, elevation, or time zones, use the REST API. Keep API keys in environment/config only; never hard-code or commit them.
- Do not use Mapy.com as a replacement for Google reviews, Google photos, or business listing detail links. Keep Google URLs for those workflows.

## Coordinate Rules

TRIP stores coordinates as `lat,lng`. Mapy.com URL parameters use `lon,lat` / `lng,lat`.

Always convert explicitly:

```ts
const center = `${lng},${lat}`;
```

Do not reuse Google Maps query strings for Mapy.com; Google commonly accepts `lat,lng`, while Mapy URL functions expect `lng,lat`.

## URL Construction

- Base prefix: `https://mapy.com/fnc/v1`
- Valid common `mapset` values: `basic`, `outdoor`, `winter`, `aerial`, `traffic`.
- Prefer `outdoor` for travel, hiking, and printed roadbook QR codes.
- URL-encode text parameters and full coordinate lists when building strings programmatically.
- Use `marker=true` for point QR codes so a scan opens to a visible point.
- Use `navigate=true` only for route URLs where immediate app navigation is desired; otherwise opening the planned route is less surprising.

## Validation Checklist

- Confirm coordinate order with a known point before shipping.
- Scan or open one generated QR URL on desktop and mobile.
- If using REST APIs, verify key handling, rate/credit implications, attribution, and error states.
- For print output, prefer inline SVG QR rendering over image data URLs when browser print reliability matters.
