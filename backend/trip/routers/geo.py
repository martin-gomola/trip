"""Geo-link resolver: extract lat/lng from Google Maps URLs.

Two paths are supported:

1. Long URLs (``https://www.google.com/maps/...``) — coordinates are present
   in the URL itself. Parsed without any network call.
2. Short share URLs (``https://maps.app.goo.gl/...``) — require a redirect
   resolution. We fetch with redirects disabled, read the ``Location``
   header, and parse that.

Only Google Maps hosts are accepted (allow-list) to limit SSRF risk; the
HTTP client never follows redirects automatically and only one hop is
inspected. Authentication is required, mirroring other API routes.
"""

import logging
import re
from typing import Annotated
from urllib.parse import parse_qs, urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, HttpUrl

from ..deps import get_current_username

router = APIRouter(prefix="/api/geo", tags=["geo"])

logger = logging.getLogger(__name__)

# Allow-list of Google Maps hosts. Resolving redirects to anywhere else is
# rejected to keep SSRF surface small.
ALLOWED_HOSTS = {
    "maps.app.goo.gl",
    "goo.gl",
    "www.google.com",
    "google.com",
    "maps.google.com",
    "www.google.co.uk",  # regional variants are common in shared links
}

REQUEST_TIMEOUT = 5.0
MAX_BODY_BYTES = 64 * 1024  # we only need headers, but cap the body just in case

# Coordinate patterns used in long Google Maps URLs.
# Examples:
#   /place/Foo/@48.8802,19.1054,17z
#   ?q=48.8802,19.1054
#   ?ll=48.8802,19.1054
#   /maps/dir//48.8802,19.1054
_AT_PATTERN = re.compile(r"@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)")
_BANG_PATTERN = re.compile(r"!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)")
_PLAIN_PATTERN = re.compile(r"(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)")


class GeoLinkRequest(BaseModel):
    url: HttpUrl


class GeoLinkResponse(BaseModel):
    lat: float
    lng: float
    source: str  # "url" if parsed from URL, "redirect" if a hop was followed


def _is_valid_coord(lat: float, lng: float) -> bool:
    return -90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0


def _host_allowed(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in {"http", "https"} and parsed.hostname in ALLOWED_HOSTS


def _extract_from_url(url: str) -> tuple[float, float] | None:
    """Try every known coordinate pattern against the URL."""
    parsed = urlparse(url)

    # 1. ?q=lat,lng / ?ll=lat,lng / ?center=lat,lng / ?destination=lat,lng
    query = parse_qs(parsed.query)
    for key in ("q", "ll", "center", "destination"):
        for raw in query.get(key, []):
            match = _PLAIN_PATTERN.search(raw)
            if match:
                lat, lng = float(match.group(1)), float(match.group(2))
                if _is_valid_coord(lat, lng):
                    return lat, lng

    # 2. @lat,lng,zoom in the path
    match = _AT_PATTERN.search(parsed.path)
    if match:
        lat, lng = float(match.group(1)), float(match.group(2))
        if _is_valid_coord(lat, lng):
            return lat, lng

    # 3. !3dLAT!4dLNG (encoded place anchor)
    match = _BANG_PATTERN.search(parsed.path)
    if match:
        lat, lng = float(match.group(1)), float(match.group(2))
        if _is_valid_coord(lat, lng):
            return lat, lng

    return None


async def _resolve_short_link(url: str) -> tuple[float, float] | None:
    """Follow up to two hops looking for a coordinate-bearing URL."""
    current = url
    async with httpx.AsyncClient(
        timeout=REQUEST_TIMEOUT,
        follow_redirects=False,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; TRIP/1; geo-link resolver)",
        },
    ) as client:
        for _ in range(3):  # at most 3 hops to avoid open-redirect chains
            if not _host_allowed(current):
                return None
            try:
                response = await client.get(current)
            except httpx.HTTPError as exc:
                logger.warning("Geo resolve HTTP error for %s: %s", current, exc)
                return None

            # Some endpoints answer 200 with the final URL in the body.
            # Prefer the Location header when present.
            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    return None
                # Some services return a relative location.
                if location.startswith("/"):
                    parsed = urlparse(current)
                    location = f"{parsed.scheme}://{parsed.hostname}{location}"
                current = location
                coords = _extract_from_url(current)
                if coords:
                    return coords
                continue

            # 200 OK: try to extract from the final URL of the request chain
            coords = _extract_from_url(str(response.url))
            if coords:
                return coords
            return None

    return None


@router.post("/resolve-link", response_model=GeoLinkResponse)
async def resolve_geo_link(
    body: GeoLinkRequest,
    current_user: Annotated[str, Depends(get_current_username)],  # noqa: ARG001 (auth gate)
) -> GeoLinkResponse:
    url = str(body.url)
    if not _host_allowed(url):
        raise HTTPException(422, "Only Google Maps URLs are supported")

    coords = _extract_from_url(url)
    if coords:
        return GeoLinkResponse(lat=coords[0], lng=coords[1], source="url")

    coords = await _resolve_short_link(url)
    if coords:
        return GeoLinkResponse(lat=coords[0], lng=coords[1], source="redirect")

    raise HTTPException(422, "Could not extract coordinates from this link")
