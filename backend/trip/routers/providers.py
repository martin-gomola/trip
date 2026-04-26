import asyncio
import html
import json
import logging
import re
from typing import Annotated, Any
from urllib.parse import urljoin

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
import httpx
from pydantic import BaseModel

from ..deps import SessionDep, get_current_username
from ..models.models import (LatitudeLongitude, ProviderBoundaries,
                             ProviderPlaceResult, RoutingQuery,
                             RoutingResponse, User)
from ..utils.csv import iter_csv_lines
from ..utils.providers import (BaseMapProvider, GoogleMapsProvider,
                               OpenStreetMapProvider)
from ..utils.zip import parse_mymaps_kmz

router = APIRouter(prefix="/api/completions", tags=["completions"])


logger = logging.getLogger(__name__)


class GoogleListImportRequest(BaseModel):
    url: str


GOOGLE_LIST_URL_PATTERN = re.compile(r"/maps/preview/entitylist/getlist[^\"']+")
GOOGLE_LIST_TIMEOUT = 15
GOOGLE_LIST_HEADERS = {
    "User-Agent": "curl/8.7.1",
}


def _get_user(session: SessionDep, current_user: str) -> User:
    db_user = session.get(User, current_user)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


def _raise_missing_apikey(db_user, raise_msg=""):
    if not db_user.google_apikey:
        raise HTTPException(
            status_code=400, detail=raise_msg if raise_msg else "Google Maps API key not configured"
        )


def _get_map_provider(session: SessionDep, current_user: str) -> BaseMapProvider:
    db_user = _get_user(session, current_user)
    provider_type = getattr(db_user, "map_provider", "osm").lower()
    if provider_type == "google":
        _raise_missing_apikey(db_user)
        return GoogleMapsProvider(api_key=db_user.google_apikey)

    return OpenStreetMapProvider()


async def _process_batch(
    items: list[str | dict],
    provider: BaseMapProvider,
    processor_func,
) -> list[ProviderPlaceResult]:
    if not items:
        return []

    semaphore = asyncio.Semaphore(4)

    async def _process_with_semaphore(item):
        async with semaphore:
            return await processor_func(item, provider)

    results = await asyncio.gather(
        *[_process_with_semaphore(item) for item in items],
        return_exceptions=True,
    )

    valid_results = []
    for r in results:
        if isinstance(r, ProviderPlaceResult):
            valid_results.append(r)
        elif isinstance(r, Exception):
            logger.error(f"[PROCESS BATCH]: A item failed, {r}")

    return valid_results


def _get_google_list_value(node: Any, path: list[int]) -> Any:
    value = node
    for key in path:
        if not isinstance(value, list) or len(value) <= key:
            return None
        value = value[key]
    return value


def _google_list_cid(raw_cid: Any) -> str | None:
    if raw_cid in (None, ""):
        return None
    try:
        cid = int(raw_cid)
    except (TypeError, ValueError):
        return None
    if cid < 0:
        cid += 2**64
    return str(cid)


def _google_list_fallback_place(item: dict[str, Any]) -> ProviderPlaceResult | None:
    name = item.get("name")
    lat = item.get("lat")
    lng = item.get("lng")

    if not name or lat is None or lng is None:
        return None

    place = item.get("address") or item.get("full_title") or name
    return ProviderPlaceResult(
        name=name,
        place=place,
        lat=float(lat),
        lng=float(lng),
        types=[],
        description=place,
        url=item.get("url"),
        image=None,
        restroom=None,
    )


def _parse_google_list_payload(text: str) -> list[dict[str, Any]]:
    if text.startswith(")]}'"):
        text = text.split("\n", 1)[1]

    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Google list response could not be parsed") from exc

    entries = _get_google_list_value(payload, [0, 8])
    if not isinstance(entries, list):
        raise HTTPException(status_code=400, detail="Google list did not contain place entries")

    places = []
    for entry in entries:
        if not isinstance(entry, list):
            continue

        name = _get_google_list_value(entry, [2]) or _get_google_list_value(entry, [1, 2])
        address = _get_google_list_value(entry, [1, 4])
        full_title = _get_google_list_value(entry, [1, 2])
        lat = _get_google_list_value(entry, [1, 5, 2])
        lng = _get_google_list_value(entry, [1, 5, 3])
        cid = _google_list_cid(_get_google_list_value(entry, [1, 6, 1]))

        places.append(
            {
                "name": name,
                "address": address,
                "full_title": full_title,
                "lat": lat,
                "lng": lng,
                "cid": cid,
                "url": f"https://www.google.com/maps?cid={cid}" if cid else None,
            }
        )

    return places


async def _fetch_google_list_entries(url: str) -> list[dict[str, Any]]:
    if not url.strip():
        raise HTTPException(status_code=400, detail="Google list URL is required")

    try:
        async with httpx.AsyncClient(timeout=GOOGLE_LIST_TIMEOUT, follow_redirects=True) as client:
            list_page = await client.get(url.strip(), headers=GOOGLE_LIST_HEADERS)
            list_page.raise_for_status()

            match = GOOGLE_LIST_URL_PATTERN.search(html.unescape(list_page.text))
            if not match:
                raise HTTPException(status_code=400, detail="Shared Google list could not be found")

            entitylist_url = urljoin(str(list_page.url), match.group(0))
            response = await client.get(
                entitylist_url,
                headers={**GOOGLE_LIST_HEADERS, "Referer": str(list_page.url)},
            )
            response.raise_for_status()
            return _parse_google_list_payload(response.text)
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=400, detail=f"Google list request failed: {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=400, detail=f"Google list request failed: {exc}") from exc


@router.post("/bulk")
async def bulk_to_places(
    data: list[str],
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[ProviderPlaceResult]:
    provider = _get_map_provider(session, current_user)

    async def _process_content(content: str, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            if "google.com/maps" in content:
                db_user = _get_user(session, current_user)
                _raise_missing_apikey(db_user, "Google Maps links provided but missing API key")
                provider = GoogleMapsProvider(api_key=db_user.google_apikey)
                if result := await provider.url_to_place(content):
                    return await provider.result_to_place(result)
            else:
                if results := await provider.text_search(content):
                    return await provider.result_to_place(results[0])
        except Exception:
            pass
        return None

    return await _process_batch(data, provider, _process_content)


@router.get("/search")
async def text_search(
    q: str,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[ProviderPlaceResult]:
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query required")

    provider = _get_map_provider(session, current_user)
    results = await provider.text_search(q.strip())

    if not results:
        return []

    async def _process_result(place_data: dict, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            return await provider.result_to_place(place_data)
        except Exception:
            return None

    return await _process_batch(results, provider, _process_result)


@router.post("/nearby")
async def nearby_search(
    data: LatitudeLongitude,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[ProviderPlaceResult]:
    provider = _get_map_provider(session, current_user)

    location = {"latitude": data.latitude, "longitude": data.longitude}
    results = await provider.search_nearby(location)

    if not results:
        return []

    async def _process_result(place_data: dict, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            return await provider.result_to_place(place_data)
        except Exception:
            return None

    return await _process_batch(results, provider, _process_result)


@router.get("/geocode")
async def geocode_search(
    q: str,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> ProviderBoundaries:
    if not q or not q.strip():
        raise HTTPException(status_code=400, detail="Query required")

    provider = _get_map_provider(session, current_user)
    if not (bounds := await provider.geocode(q.strip())):
        raise HTTPException(status_code=404, detail="Location not found")
    return bounds


@router.post("/route")
async def get_route(
    data: RoutingQuery,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> RoutingResponse:
    if len(data.coordinates) < 2:
        raise HTTPException(status_code=400, detail="Coordinates required")
    provider = _get_map_provider(session, current_user)
    return await provider.get_route(data)


#####
## Google-specific
@router.post("/mymaps-import")
async def google_mymaps_kmz_import(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[ProviderPlaceResult]:
    db_user = _get_user(session, current_user)
    _raise_missing_apikey(db_user)
    provider = GoogleMapsProvider(api_key=db_user.google_apikey)

    if not file.filename or not file.filename.lower().endswith(".kmz"):
        raise HTTPException(status_code=400, detail="Invalid KMZ file")

    places = await asyncio.to_thread(parse_mymaps_kmz, file)
    async def _process_kml_place(place: dict, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            if url := place.get("url"):
                if place_data := await provider.url_to_place(url):
                    return await provider.result_to_place(place_data)
            elif place.get("lat") and place.get("lng"):
                location = {
                    "latitude": float(place.get("lat")),
                    "longitude": float(place.get("lng")),
                }
                results = await provider.text_search(place.get("name"), location)
                return await provider.result_to_place(results[0])
        except Exception:
            return None

    return await _process_batch(places, provider, _process_kml_place)


@router.post("/takeout-import")
async def google_takeout_csv_import(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[ProviderPlaceResult]:
    db_user = _get_user(session, current_user)
    _raise_missing_apikey(db_user)
    provider = GoogleMapsProvider(api_key=db_user.google_apikey)

    if file.content_type != "text/csv":
        raise HTTPException(status_code=400, detail="Expected CSV file")

    urls = []
    async for row in iter_csv_lines(file):
        if url := row.get("URL"):
            urls.append(url)

    if not urls:
        return []

    async def _process_url(url: str, provider: BaseMapProvider) -> ProviderPlaceResult | None:
        try:
            if place_data := await provider.url_to_place(url):
                return await provider.result_to_place(place_data)
        except Exception:
            pass
        return None

    return await _process_batch(urls, provider, _process_url)


@router.post("/google-list-import")
async def google_list_import(
    data: GoogleListImportRequest,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[ProviderPlaceResult]:
    db_user = _get_user(session, current_user)
    _raise_missing_apikey(db_user)
    provider = GoogleMapsProvider(api_key=db_user.google_apikey)
    list_places = await _fetch_google_list_entries(data.url)

    async def _process_google_list_place(
        place: dict[str, Any],
        provider: BaseMapProvider,
    ) -> ProviderPlaceResult | None:
        try:
            if isinstance(provider, GoogleMapsProvider) and place.get("cid"):
                place_id = await provider._cid_to_pid(place["cid"])
                if place_id:
                    place_data = await provider.get_place_details(place_id)
                    result = await provider.result_to_place(place_data)
                    if place.get("url"):
                        result.url = place["url"]
                    return result
        except Exception:
            pass

        return _google_list_fallback_place(place)

    return await _process_batch(list_places, provider, _process_google_list_place)


@router.get("/google/resolve-shortlink/{link_id}")
async def google_resolve_shortlink(
    link_id: str,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> ProviderPlaceResult:
    if not link_id:
        raise HTTPException(status_code=400, detail="Google ID is missing, resolve failed")

    db_user = _get_user(session, current_user)
    _raise_missing_apikey(db_user)
    provider = GoogleMapsProvider(api_key=db_user.google_apikey)
    url = await provider._resolve_shortlink(link_id)

    if place_data := await provider.url_to_place(url):
        result = await provider.result_to_place(place_data)
        result.url = url
        return result

    raise HTTPException(status_code=404, detail="Place not found")
