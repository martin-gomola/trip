#!/usr/bin/env python3
"""Small TRIP by-token API helper with compact local docs.

The performance win is the built-in API catalog for agents. Runtime API calls
read credentials from environment variables or .env; nothing is persisted.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "http://localhost:8050"
DEFAULT_ENV_FILE = ".env"
REPO_ROOT = Path(__file__).resolve().parents[3]

API_CATALOG: dict[str, dict[str, Any]] = {
    "categories": {
        "method": "GET",
        "path": "/api/by_token/categories",
        "purpose": "List exact category names for the current API-token user.",
        "required": [],
        "optional": [],
        "cli": "trip_api.py categories list",
        "returns": "array of {id, name, color, image, image_id}",
        "notes": ["Use before place creation because category names are case-sensitive."],
    },
    "place": {
        "method": "POST",
        "path": "/api/by_token/place",
        "purpose": "Create a place from explicit coordinates and metadata.",
        "required": ["category", "name", "lat", "lng", "place"],
        "optional": [
            "image",
            "allowdog",
            "description",
            "price",
            "price_currency",
            "duration",
            "checkin_time",
            "checkout_time",
            "favorite",
            "visited",
            "gpx",
            "restroom",
            "trip_only",
        ],
        "cli": (
            "trip_api.py place create --category Culture --name 'Example' "
            "--lat 48.1486 --lng 17.1077 --place 'Bratislava'"
        ),
        "returns": "PlaceRead object",
        "notes": ["category must already exist and match case exactly."],
    },
    "google-search": {
        "method": "POST",
        "path": "/api/by_token/google-search",
        "purpose": "Create a place resolved by Google from a name, Maps place URL, or short link.",
        "required": ["q"],
        "optional": ["category"],
        "cli": "trip_api.py place google-search --query 'British Museum' --category Culture",
        "returns": "PlaceRead object",
        "notes": [
            "Requires a TRIP API token and a Google API key configured in the TRIP account.",
            "Google type mapping wins over the provided category when it maps cleanly.",
        ],
    },
}

API_DOC_SOURCES = [
    "https://martin-gomola.github.io/trip/docs/trip-api/generating-api-key/",
    "https://martin-gomola.github.io/trip/docs/trip-api/place-creation/",
    "https://martin-gomola.github.io/trip/docs/trip-api/place-google-search/",
]

ROADTRIP_TEMPLATE: dict[str, Any] = {
    "trip": {
        "name": "Example Roadtrip",
        "currency": "EUR",
        "home_name": "Start",
        "home_lat": 48.1971,
        "home_lng": 17.1398,
        "notes": "Assumptions, sources, and booking notes go here.",
    },
    "places": [
        {
            "key": "destination",
            "name": "Destination name",
            "category": "Accommodation",
            "lat": 48.0,
            "lng": 17.0,
            "place": "Street, city, country",
            "description": "Why this place matters and source URL.",
            "favorite": True,
            "visited": False,
            "trip_only": True,
        }
    ],
    "days": [
        {
            "label": "Day 1 - Travel",
            "date": "2026-05-08",
            "day_start_time": "08:00",
            "notes": "Day-level notes.",
            "items": [
                {
                    "time": "12:30",
                    "text": "Arrive at destination",
                    "comment": "Confirm check-in time.",
                    "place": "destination",
                    "status": "pending",
                    "booking_status": "requested",
                    "cost_status": "estimated",
                    "fee_amount": 0,
                },
            ],
        }
    ],
}

ROADTRIP_STATUSES = {"pending", "booked", "constraint", "optional"}
ROADTRIP_BOOKING_STATUSES = {"not booked", "requested", "booked", "cancelled"}
ROADTRIP_COST_STATUSES = {"estimated", "confirmed", "paid"}
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class TripApiError(RuntimeError):
    pass


CONTAINER_ROADTRIP_CODE = r"""
import json
import sys
from datetime import date

from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from trip.db.core import get_engine
from trip.models.models import (
    Category,
    Place,
    Trip,
    TripBookingStatusEnum,
    TripCostStatusEnum,
    TripDay,
    TripItem,
    TripItemStatusEnum,
    User,
)


def parse_date(value):
    if not value:
        return None
    return date.fromisoformat(value)


def choose_user(session, requested):
    if requested:
        user = session.get(User, requested)
        if not user:
            raise SystemExit(f"Unknown TRIP user: {requested}")
        return requested
    user = session.exec(select(User).order_by(User.is_admin.desc(), User.username)).first()
    if not user:
        raise SystemExit("No TRIP users exist")
    return user.username


def load_trip(session, user, name):
    return session.exec(
        select(Trip)
        .options(selectinload(Trip.places), selectinload(Trip.days).selectinload(TripDay.items))
        .where(Trip.user == user, Trip.name == name)
    ).first()


def serialize_trip(trip):
    days = sorted(trip.days, key=lambda day: (day.dt is None, day.dt or date.max, day.label))
    return {
        "id": trip.id,
        "name": trip.name,
        "notes": trip.notes,
        "places": [
            {
                "id": place.id,
                "name": place.name,
                "place": place.place,
                "lat": place.lat,
                "lng": place.lng,
            }
            for place in trip.places
        ],
        "days": [
            {
                "id": day.id,
                "label": day.label,
                "date": day.dt.isoformat() if day.dt else None,
                "item_count": len(day.items),
                "items": [
                    {
                        "id": item.id,
                        "time": item.time,
                        "text": item.text,
                        "place_id": item.place_id,
                        "lat": item.lat,
                        "lng": item.lng,
                        "status": item.status.value if item.status else None,
                        "booking_status": item.booking_status.value if item.booking_status else None,
                        "booking_reference": item.booking_reference,
                        "booking_cancellation_deadline": item.booking_cancellation_deadline.isoformat()
                        if item.booking_cancellation_deadline
                        else None,
                        "cost_status": item.cost_status.value if item.cost_status else None,
                        "fee_amount": item.fee_amount,
                        "fee_label": item.fee_label,
                    }
                    for item in sorted(day.items, key=lambda item: item.time)
                ],
            }
            for day in days
        ],
    }


def upsert_place(session, user, spec):
    category_name = spec.get("category") or "Accommodation"
    category = session.exec(select(Category).where(Category.user == user, Category.name == category_name)).first()
    if not category:
        raise SystemExit(f"Unknown category for {spec.get('name')}: {category_name}")
    place = session.exec(select(Place).where(Place.user == user, Place.name == spec["name"])).first()
    created = False
    changed = False
    if not place:
        place = Place(
            name=spec["name"],
            lat=float(spec["lat"]),
            lng=float(spec["lng"]),
            place=spec["place"],
            category_id=category.id,
            user=user,
        )
        session.add(place)
        created = True
        changed = True
    for key in ["lat", "lng"]:
        if key in spec and getattr(place, key) != float(spec[key]):
            setattr(place, key, float(spec[key]))
            changed = True
    for key in [
        "place",
        "description",
        "allowdog",
        "favorite",
        "visited",
        "restroom",
        "price",
        "price_currency",
        "duration",
        "checkin_time",
        "checkout_time",
        "gpx",
        "trip_only",
    ]:
        if key in spec and getattr(place, key) != spec[key]:
            setattr(place, key, spec[key])
            changed = True
    if place.category_id != category.id:
        place.category_id = category.id
        changed = True
    if changed:
        session.commit()
        session.refresh(place)
    if created:
        return place, "created"
    if changed:
        return place, "updated"
    return place, "existing"


def find_item(session, day_id, item_spec, place_id):
    exact = session.exec(
        select(TripItem).where(
            TripItem.day_id == day_id,
            TripItem.time == item_spec["time"],
            TripItem.text == item_spec["text"],
        )
    ).first()
    if exact:
        return exact

    text_matches = session.exec(
        select(TripItem).where(
            TripItem.day_id == day_id,
            TripItem.text == item_spec["text"],
        )
    ).all()
    if len(text_matches) == 1:
        return text_matches[0]

    if place_id is not None:
        place_matches = [candidate for candidate in text_matches if candidate.place_id == place_id]
        if len(place_matches) == 1:
            return place_matches[0]

    return None


def apply(payload):
    plan = payload["plan"]
    with Session(get_engine()) as session:
        user = choose_user(session, payload.get("user"))
        place_by_key = {}
        place_events = []
        for spec in plan.get("places", []):
            place, event = upsert_place(session, user, spec)
            place_by_key[spec["key"]] = place
            place_events.append({"event": event, "key": spec["key"], "id": place.id, "name": place.name})

        trip_spec = plan["trip"]
        trip = load_trip(session, user, trip_spec["name"])
        created_trip = False
        if not trip:
            trip = Trip(
                name=trip_spec["name"],
                currency=trip_spec.get("currency", "EUR"),
                home_name=trip_spec.get("home_name"),
                home_lat=trip_spec.get("home_lat"),
                home_lng=trip_spec.get("home_lng"),
                user=user,
            )
            session.add(trip)
            session.commit()
            session.refresh(trip)
            created_trip = True
            trip = load_trip(session, user, trip_spec["name"])

        changed = False
        for key in ["currency", "notes", "archival_review", "home_name", "home_lat", "home_lng"]:
            if key in trip_spec and getattr(trip, key) != trip_spec[key]:
                setattr(trip, key, trip_spec[key])
                changed = True
        for place in place_by_key.values():
            if all(existing.id != place.id for existing in trip.places):
                trip.places.append(place)
                changed = True
        if changed:
            session.add(trip)
            session.commit()
            trip = load_trip(session, user, trip_spec["name"])

        day_events = []
        item_events = []
        day_by_label = {}
        day_by_date = {}
        for day_spec in plan["days"]:
            dt = parse_date(day_spec.get("date"))
            existing_days = list(trip.days)
            day = None
            if dt:
                day = next((candidate for candidate in existing_days if candidate.dt == dt), None)
            if not day:
                day = next((candidate for candidate in existing_days if candidate.label == day_spec["label"]), None)
            if not day:
                day = TripDay(
                    label=day_spec["label"],
                    dt=dt,
                    notes=day_spec.get("notes"),
                    day_start_time=day_spec.get("day_start_time"),
                    trip_id=trip.id,
                )
                session.add(day)
                session.commit()
                session.refresh(day)
                day_events.append({"event": "created", "id": day.id, "label": day.label})
            else:
                updated = False
                for key, value in {
                    "label": day_spec["label"],
                    "dt": dt,
                    "notes": day_spec.get("notes"),
                    "day_start_time": day_spec.get("day_start_time"),
                }.items():
                    if value is not None and getattr(day, key) != value:
                        setattr(day, key, value)
                        updated = True
                if updated:
                    session.add(day)
                    session.commit()
                    session.refresh(day)
                    day_events.append({"event": "updated", "id": day.id, "label": day.label})
                else:
                    day_events.append({"event": "existing", "id": day.id, "label": day.label})

            day_by_label[day.label] = day
            if day.dt:
                day_by_date[day.dt.isoformat()] = day

        for day_spec in plan["days"]:
            dt = parse_date(day_spec.get("date"))
            day = day_by_date.get(dt.isoformat()) if dt else None
            if not day:
                day = day_by_label[day_spec["label"]]

            for item_spec in day_spec.get("items", []):
                place_id = None
                if item_spec.get("place"):
                    place_id = place_by_key[item_spec["place"]].id
                item = find_item(session, day.id, item_spec, place_id)
                status = item_spec.get("status")
                status_value = TripItemStatusEnum(status) if status else None
                booking_status = item_spec.get("booking_status")
                cost_status = item_spec.get("cost_status")
                checkout_ref = item_spec.get("stay_checkout_day")
                checkout_day_id = None
                if checkout_ref:
                    checkout_day = day_by_date.get(str(checkout_ref)) or day_by_label.get(str(checkout_ref))
                    if not checkout_day:
                        raise SystemExit(f"Unknown stay checkout day: {checkout_ref}")
                    checkout_day_id = checkout_day.id
                fields = {
                    "time": item_spec["time"],
                    "text": item_spec["text"],
                    "comment": item_spec.get("comment"),
                    "lat": item_spec.get("lat"),
                    "lng": item_spec.get("lng"),
                    "price": item_spec.get("price"),
                    "price_currency": item_spec.get("price_currency"),
                    "paid_by": item_spec.get("paid_by"),
                    "place_id": place_id,
                    "status": status_value,
                    "booking_status": TripBookingStatusEnum(booking_status) if booking_status else None,
                    "booking_reference": item_spec.get("booking_reference"),
                    "booking_cancellation_deadline": parse_date(item_spec.get("booking_cancellation_deadline")),
                    "cost_status": TripCostStatusEnum(cost_status) if cost_status else None,
                    "fee_amount": item_spec.get("fee_amount"),
                    "fee_label": item_spec.get("fee_label"),
                    "stay_checkout_day_id": checkout_day_id,
                    "stay_checkout_time": item_spec.get("stay_checkout_time"),
                    "duration_minutes": item_spec.get("duration_minutes"),
                    "day_id": day.id,
                }
                if not item:
                    item = TripItem(**fields)
                    session.add(item)
                    session.commit()
                    session.refresh(item)
                    item_events.append({"event": "created", "id": item.id, "text": item.text})
                else:
                    updated = False
                    for key, value in fields.items():
                        if getattr(item, key) != value:
                            setattr(item, key, value)
                            updated = True
                    if updated:
                        session.add(item)
                        session.commit()
                        session.refresh(item)
                        item_events.append({"event": "updated", "id": item.id, "text": item.text})
                    else:
                        item_events.append({"event": "existing", "id": item.id, "text": item.text})

            trip = load_trip(session, user, trip_spec["name"])

        trip = load_trip(session, user, trip_spec["name"])
        return {
            "user": user,
            "trip_event": "created" if created_trip else "existing",
            "trip": serialize_trip(trip),
            "places": place_events,
            "days": day_events,
            "items": item_events,
        }


def show(payload):
    with Session(get_engine()) as session:
        user = choose_user(session, payload.get("user"))
        query = select(Trip).options(
            selectinload(Trip.places),
            selectinload(Trip.days).selectinload(TripDay.items),
        )
        if payload.get("trip_id"):
            query = query.where(Trip.id == int(payload["trip_id"]))
        else:
            query = query.where(Trip.user == user, Trip.name == payload["trip_name"])
        trip = session.exec(query).first()
        if not trip:
            raise SystemExit("Trip not found")
        return {"user": user, "trip": serialize_trip(trip)}


payload = json.load(sys.stdin)
action = payload["action"]
if action == "apply":
    result = apply(payload)
elif action == "show":
    result = show(payload)
else:
    raise SystemExit(f"Unsupported action: {action}")
print(json.dumps(result, indent=2, sort_keys=True))
"""


def parse_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        values[key] = value
    return values


def resolve_env_file_path(value: str) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute() or path.exists():
        return path
    repo_path = REPO_ROOT / path
    if repo_path.exists():
        return repo_path
    return path


def normalize_base_url(value: str) -> str:
    value = value.strip().rstrip("/")
    if not value:
        raise TripApiError("Base URL cannot be empty")
    if not value.startswith(("http://", "https://")):
        value = f"https://{value}"
    return value


def env_values(args: argparse.Namespace) -> dict[str, str]:
    return parse_env_file(resolve_env_file_path(args.env_file))


def resolve_base_url(args: argparse.Namespace, *, default_local: bool = False) -> str:
    values = env_values(args)
    base_url = (
        getattr(args, "base_url", None)
        or os.environ.get("TRIP_BASE_URL")
        or values.get("TRIP_LOCAL_BASE_URL")
        or (DEFAULT_BASE_URL if default_local else None)
    )
    if not base_url and default_local:
        base_url = DEFAULT_BASE_URL
    if not base_url:
        raise TripApiError("No base URL set. Pass --base-url or set TRIP_BASE_URL.")
    return normalize_base_url(base_url)


def resolve_credentials(args: argparse.Namespace) -> tuple[str, str]:
    values = env_values(args)
    base_url = resolve_base_url(args, default_local=True)

    token = None
    env_name = getattr(args, "token_env", None)
    if env_name and os.environ.get(env_name):
        token = os.environ[env_name]
    if not token:
        token = values.get(env_name or "TRIP_API_TOKEN")
    if not token:
        raise TripApiError(f"No API token set. Set {env_name or 'TRIP_API_TOKEN'} or provide --env-file.")
    return base_url, token


def request_json(base_url: str, token: str, method: str, path: str, payload: Any | None = None) -> Any:
    if not path.startswith("/"):
        path = "/" + path
    url = base_url + path
    body = None
    headers = {
        "Accept": "application/json",
        "User-Agent": "trip-planner-cli/1.0",
        "X-Api-Token": token,
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=headers, method=method.upper())
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            text = raw.decode("utf-8", errors="replace")
            if not text:
                return None
            content_type = response.headers.get("Content-Type", "")
            if "json" in content_type:
                return json.loads(text)
            return text
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        raise TripApiError(f"HTTP {exc.code} {exc.reason}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise TripApiError(f"Request failed: {exc.reason}") from exc


def request_public_json(base_url: str, path: str) -> Any:
    if not path.startswith("/"):
        path = "/" + path
    request = urllib.request.Request(
        base_url + path,
        headers={"Accept": "application/json", "User-Agent": "trip-planner-cli/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace").strip()
        raise TripApiError(f"HTTP {exc.code} {exc.reason}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise TripApiError(f"Request failed: {exc.reason}") from exc


def print_json(data: Any) -> None:
    if data is None:
        return
    if isinstance(data, str):
        print(data)
        return
    print(json.dumps(data, indent=2, sort_keys=True))


def load_json_arg(value: str | None) -> Any | None:
    if value is None:
        return None
    if value == "-":
        return json.load(sys.stdin)
    if value.startswith("@"):
        with Path(value[1:]).expanduser().open("r", encoding="utf-8") as handle:
            return json.load(handle)
    return json.loads(value)


def load_roadtrip_plan(value: str) -> dict[str, Any]:
    plan = load_json_arg(value)
    if not isinstance(plan, dict):
        raise TripApiError("Roadtrip plan must be a JSON object")
    return plan


def validate_roadtrip_plan(plan: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    trip = plan.get("trip")
    if not isinstance(trip, dict):
        errors.append("trip must be an object")
    elif not trip.get("name"):
        errors.append("trip.name is required")
    else:
        for field in ["home_lat", "home_lng"]:
            if field in trip and trip[field] is not None:
                try:
                    float(trip[field])
                except (TypeError, ValueError):
                    errors.append(f"trip.{field} must be numeric")

    places = plan.get("places", [])
    if places is None:
        places = []
    if not isinstance(places, list):
        errors.append("places must be a list")
        places = []
    place_keys: set[str] = set()
    for index, place in enumerate(places):
        prefix = f"places[{index}]"
        if not isinstance(place, dict):
            errors.append(f"{prefix} must be an object")
            continue
        key = place.get("key")
        if not key:
            errors.append(f"{prefix}.key is required")
        elif key in place_keys:
            errors.append(f"{prefix}.key duplicates {key!r}")
        else:
            place_keys.add(key)
        for field in ["name", "lat", "lng", "place"]:
            if field not in place or place[field] in ("", None):
                errors.append(f"{prefix}.{field} is required")
        for field in ["lat", "lng"]:
            if field in place:
                try:
                    float(place[field])
                except (TypeError, ValueError):
                    errors.append(f"{prefix}.{field} must be numeric")

    days = plan.get("days")
    if not isinstance(days, list) or not days:
        errors.append("days must be a non-empty list")
        days = []
    day_refs = {
        str(day.get(ref_field))
        for day in days
        if isinstance(day, dict)
        for ref_field in ("label", "date")
        if day.get(ref_field)
    }
    for day_index, day in enumerate(days):
        day_prefix = f"days[{day_index}]"
        if not isinstance(day, dict):
            errors.append(f"{day_prefix} must be an object")
            continue
        if not day.get("label"):
            errors.append(f"{day_prefix}.label is required")
        if day.get("date"):
            try:
                from datetime import date

                date.fromisoformat(day["date"])
            except (TypeError, ValueError):
                errors.append(f"{day_prefix}.date must be YYYY-MM-DD")
        items = day.get("items", [])
        if not isinstance(items, list):
            errors.append(f"{day_prefix}.items must be a list")
            continue
        for item_index, item in enumerate(items):
            item_prefix = f"{day_prefix}.items[{item_index}]"
            if not isinstance(item, dict):
                errors.append(f"{item_prefix} must be an object")
                continue
            if not item.get("text"):
                errors.append(f"{item_prefix}.text is required")
            if not item.get("time"):
                errors.append(f"{item_prefix}.time is required")
            elif not TIME_RE.fullmatch(str(item["time"])):
                errors.append(f"{item_prefix}.time must be HH:MM")
            if item.get("place") and item["place"] not in place_keys:
                errors.append(f"{item_prefix}.place references unknown place key {item['place']!r}")
            for field in ["lat", "lng", "price", "fee_amount", "duration_minutes"]:
                if field in item and item[field] is not None:
                    try:
                        float(item[field])
                    except (TypeError, ValueError):
                        errors.append(f"{item_prefix}.{field} must be numeric")
            if item.get("status") and item["status"] not in ROADTRIP_STATUSES:
                errors.append(f"{item_prefix}.status must be one of {', '.join(sorted(ROADTRIP_STATUSES))}")
            if item.get("booking_status") and item["booking_status"] not in ROADTRIP_BOOKING_STATUSES:
                errors.append(
                    f"{item_prefix}.booking_status must be one of {', '.join(sorted(ROADTRIP_BOOKING_STATUSES))}"
                )
            if item.get("cost_status") and item["cost_status"] not in ROADTRIP_COST_STATUSES:
                errors.append(f"{item_prefix}.cost_status must be one of {', '.join(sorted(ROADTRIP_COST_STATUSES))}")
            if item.get("stay_checkout_day") and str(item["stay_checkout_day"]) not in day_refs:
                errors.append(f"{item_prefix}.stay_checkout_day references unknown day {item['stay_checkout_day']!r}")
            for field in ["stay_checkout_time"]:
                if item.get(field) and not TIME_RE.fullmatch(str(item[field])):
                    errors.append(f"{item_prefix}.{field} must be HH:MM")
            if item.get("booking_cancellation_deadline"):
                try:
                    from datetime import date

                    date.fromisoformat(item["booking_cancellation_deadline"])
                except (TypeError, ValueError):
                    errors.append(f"{item_prefix}.booking_cancellation_deadline must be YYYY-MM-DD")
    return errors


def roadtrip_summary(plan: dict[str, Any]) -> dict[str, Any]:
    days = plan.get("days", [])
    places = plan.get("places", [])
    return {
        "trip": plan.get("trip", {}).get("name"),
        "places": [{"key": place.get("key"), "name": place.get("name")} for place in places if isinstance(place, dict)],
        "days": [
            {
                "label": day.get("label"),
                "date": day.get("date"),
                "items": len(day.get("items", [])) if isinstance(day.get("items", []), list) else 0,
            }
            for day in days
            if isinstance(day, dict)
        ],
    }


def run_container_roadtrip(args: argparse.Namespace, payload: dict[str, Any]) -> Any:
    command = ["docker", "exec", "-i", args.container, "python3", "-c", CONTAINER_ROADTRIP_CODE]
    result = subprocess.run(
        command,
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise TripApiError(f"Container roadtrip command failed: {detail}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise TripApiError(f"Container returned invalid JSON: {result.stdout[:500]}") from exc


def add_bool(parser: argparse.ArgumentParser, name: str) -> None:
    parser.add_argument(f"--{name}", dest=name.replace("-", "_"), action="store_true", default=None)
    parser.add_argument(f"--no-{name}", dest=name.replace("-", "_"), action="store_false")


def maybe_dry_run(args: argparse.Namespace, method: str, path: str, payload: Any | None) -> bool:
    if not getattr(args, "dry_run", False):
        return False
    base_url, _token = resolve_credentials(args)
    print(f"{method.upper()} {base_url}{path if path.startswith('/') else '/' + path}")
    print("X-Api-Token: <token-from-env>")
    if payload is not None:
        print(json.dumps(payload, indent=2, sort_keys=True))
    return True


def cmd_config(args: argparse.Namespace) -> None:
    values = env_values(args)
    token_env = getattr(args, "token_env", "TRIP_API_TOKEN")
    token_source = "none"
    if token_env and os.environ.get(token_env):
        token_source = f"env:{token_env}"
    elif values.get(token_env):
        token_source = f"env-file:{args.env_file}"
    print_json(
        {
            "base_url": resolve_base_url(args, default_local=True),
            "env_file": args.env_file,
            "env_file_found": resolve_env_file_path(args.env_file).exists(),
            "token": "set" if token_source != "none" else "missing",
            "token_source": token_source,
        }
    )


def cmd_categories_list(args: argparse.Namespace) -> None:
    if maybe_dry_run(args, "GET", "/api/by_token/categories", None):
        return
    base_url, token = resolve_credentials(args)
    print_json(request_json(base_url, token, "GET", "/api/by_token/categories"))


def place_payload(args: argparse.Namespace) -> dict[str, Any]:
    if args.json:
        payload = load_json_arg(args.json)
        if not isinstance(payload, dict):
            raise TripApiError("--json must resolve to a JSON object")
        return payload
    payload: dict[str, Any] = {
        "category": args.category,
        "name": args.name,
        "lat": args.lat,
        "lng": args.lng,
        "place": args.place,
    }
    optional_fields = [
        "image",
        "allowdog",
        "description",
        "price",
        "duration",
        "favorite",
        "visited",
        "restroom",
    ]
    for field in optional_fields:
        value = getattr(args, field)
        if value is not None:
            payload[field] = value
    if args.gpx_file:
        payload["gpx"] = Path(args.gpx_file).expanduser().read_text(encoding="utf-8")
    elif args.gpx is not None:
        payload["gpx"] = args.gpx
    return payload


def cmd_place_create(args: argparse.Namespace) -> None:
    payload = place_payload(args)
    if maybe_dry_run(args, "POST", "/api/by_token/place", payload):
        return
    base_url, token = resolve_credentials(args)
    print_json(request_json(base_url, token, "POST", "/api/by_token/place", payload))


def cmd_google_search(args: argparse.Namespace) -> None:
    payload: dict[str, Any] = {"q": args.query}
    if args.category:
        payload["category"] = args.category
    if maybe_dry_run(args, "POST", "/api/by_token/google-search", payload):
        return
    base_url, token = resolve_credentials(args)
    print_json(request_json(base_url, token, "POST", "/api/by_token/google-search", payload))


def cmd_raw(args: argparse.Namespace) -> None:
    payload = load_json_arg(args.json)
    if maybe_dry_run(args, args.method, args.path, payload):
        return
    base_url, token = resolve_credentials(args)
    print_json(request_json(base_url, token, args.method, args.path, payload))


def format_endpoint(name: str, spec: dict[str, Any]) -> str:
    required = ", ".join(spec["required"]) or "none"
    optional = ", ".join(spec["optional"]) or "none"
    notes = " ".join(spec["notes"])
    return (
        f"{name}: {spec['method']} {spec['path']}\n"
        f"  purpose: {spec['purpose']}\n"
        f"  required: {required}\n"
        f"  optional: {optional}\n"
        f"  cli: {spec['cli']}\n"
        f"  returns: {spec['returns']}\n"
        f"  notes: {notes}"
    )


def cmd_docs_brief(args: argparse.Namespace) -> None:
    print("TRIP by-token API compact context")
    print("Auth: X-Api-Token header; never print token values.")
    print("Default local base URL: http://localhost:8050")
    print("Fork docs: https://martin-gomola.github.io/trip/")
    print("Use local code and fork docs as authoritative for TRIP app behavior.")
    for name, spec in API_CATALOG.items():
        required = ", ".join(spec["required"]) or "none"
        optional = ", ".join(spec["optional"]) or "none"
        print(f"- {name}: {spec['method']} {spec['path']}; required={required}; optional={optional}; cli={spec['cli']}")


def cmd_docs_endpoint(args: argparse.Namespace) -> None:
    names = list(API_CATALOG) if args.endpoint == "all" else [args.endpoint]
    for index, name in enumerate(names):
        if index:
            print()
        print(format_endpoint(name, API_CATALOG[name]))


def cmd_docs_json(args: argparse.Namespace) -> None:
    print_json({"endpoints": API_CATALOG, "sources": API_DOC_SOURCES})


def cmd_docs_planning(args: argparse.Namespace) -> None:
    path = Path(__file__).resolve().parents[1] / "references" / "roadtrip.md"
    print(path.read_text(encoding="utf-8"))


def cmd_docs_live(args: argparse.Namespace) -> None:
    base_url = resolve_base_url(args, default_local=True)
    openapi = request_public_json(base_url, "/openapi.json")
    paths = openapi.get("paths", {})
    live: dict[str, list[str]] = {}
    for path, operations in sorted(paths.items()):
        if path.startswith("/api/by_token") and isinstance(operations, dict):
            live[path] = sorted(method.upper() for method in operations)

    catalog_paths = {spec["path"]: spec["method"] for spec in API_CATALOG.values()}
    missing_from_catalog = []
    missing_from_live = []
    for path, methods in live.items():
        for method in methods:
            if catalog_paths.get(path) != method:
                missing_from_catalog.append(f"{method} {path}")
    for path, method in catalog_paths.items():
        if method not in live.get(path, []):
            missing_from_live.append(f"{method} {path}")

    print_json(
        {
            "base_url": base_url,
            "live_by_token_paths": live,
            "catalog_matches_live": not missing_from_catalog and not missing_from_live,
            "missing_from_catalog": missing_from_catalog,
            "missing_from_live": missing_from_live,
        }
    )


def cmd_roadtrip_template(args: argparse.Namespace) -> None:
    print_json(ROADTRIP_TEMPLATE)


def cmd_roadtrip_validate(args: argparse.Namespace) -> None:
    plan = load_roadtrip_plan(args.plan)
    errors = validate_roadtrip_plan(plan)
    if errors:
        print_json({"valid": False, "errors": errors})
        raise TripApiError("Roadtrip plan validation failed")
    print_json({"valid": True, "summary": roadtrip_summary(plan)})


def cmd_roadtrip_dry_run(args: argparse.Namespace) -> None:
    plan = load_roadtrip_plan(args.plan)
    errors = validate_roadtrip_plan(plan)
    if errors:
        print_json({"valid": False, "errors": errors})
        raise TripApiError("Roadtrip plan validation failed")
    print_json({"valid": True, "would_apply": roadtrip_summary(plan)})


def cmd_roadtrip_apply(args: argparse.Namespace) -> None:
    plan = load_roadtrip_plan(args.plan)
    errors = validate_roadtrip_plan(plan)
    if errors:
        print_json({"valid": False, "errors": errors})
        raise TripApiError("Roadtrip plan validation failed")
    result = run_container_roadtrip(
        args,
        {
            "action": "apply",
            "plan": plan,
            "user": args.user,
        },
    )
    print_json(result)


def cmd_roadtrip_show(args: argparse.Namespace) -> None:
    if not args.trip_id and not args.trip_name:
        raise TripApiError("roadtrip show needs a trip id or --trip-name")
    result = run_container_roadtrip(
        args,
        {
            "action": "show",
            "trip_id": args.trip_id,
            "trip_name": args.trip_name,
            "user": args.user,
        },
    )
    print_json(result)


def add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--base-url", help="Override TRIP base URL")
    parser.add_argument("--env-file", default=os.environ.get("TRIP_ENV_FILE", DEFAULT_ENV_FILE))
    parser.add_argument("--token-env", default="TRIP_API_TOKEN", help="Environment variable to read token from")
    parser.add_argument("--dry-run", action="store_true", help="Print request details without sending it")


def add_roadtrip_runtime(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--container", default=os.environ.get("TRIP_CONTAINER", "trip"))
    parser.add_argument("--user", default=os.environ.get("TRIP_USER"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Call TRIP by-token APIs without exposing tokens.")
    add_common(parser)
    subcommands = parser.add_subparsers(dest="command", required=True)

    docs = subcommands.add_parser("docs", help="Compact local TRIP API reference for agents")
    docs_sub = docs.add_subparsers(dest="docs_command", required=True)
    docs_brief = docs_sub.add_parser("brief", help="Print the compact API cheat sheet")
    docs_brief.set_defaults(func=cmd_docs_brief)
    docs_endpoint = docs_sub.add_parser("endpoint", help="Print one endpoint reference")
    docs_endpoint.add_argument("endpoint", choices=["all", *API_CATALOG.keys()])
    docs_endpoint.set_defaults(func=cmd_docs_endpoint)
    docs_json = docs_sub.add_parser("json", help="Print the API catalog as JSON")
    docs_json.set_defaults(func=cmd_docs_json)
    docs_planning = docs_sub.add_parser("planning", help="Print the roadtrip planning workflow")
    docs_planning.set_defaults(func=cmd_docs_planning)
    docs_live = docs_sub.add_parser("live", help="Compare the catalog with the running app OpenAPI")
    docs_live.set_defaults(func=cmd_docs_live)

    roadtrip = subcommands.add_parser("roadtrip", help="Plan, validate, and apply TRIP roadtrip itineraries")
    roadtrip_sub = roadtrip.add_subparsers(dest="roadtrip_command", required=True)
    roadtrip_template = roadtrip_sub.add_parser("template", help="Print a roadtrip JSON template")
    roadtrip_template.set_defaults(func=cmd_roadtrip_template)
    roadtrip_validate = roadtrip_sub.add_parser("validate", help="Validate a roadtrip JSON plan")
    roadtrip_validate.add_argument("plan", help="JSON object, @file, or - for stdin")
    roadtrip_validate.set_defaults(func=cmd_roadtrip_validate)
    roadtrip_dry_run = roadtrip_sub.add_parser("dry-run", help="Show what a roadtrip plan would apply")
    roadtrip_dry_run.add_argument("plan", help="JSON object, @file, or - for stdin")
    roadtrip_dry_run.set_defaults(func=cmd_roadtrip_dry_run)
    roadtrip_apply = roadtrip_sub.add_parser("apply", help="Apply a roadtrip JSON plan to the local TRIP container")
    roadtrip_apply.add_argument("plan", help="JSON object, @file, or - for stdin")
    add_roadtrip_runtime(roadtrip_apply)
    roadtrip_apply.set_defaults(func=cmd_roadtrip_apply)
    roadtrip_show = roadtrip_sub.add_parser("show", help="Read back a saved TRIP roadtrip")
    roadtrip_show.add_argument("trip_id", nargs="?", type=int)
    roadtrip_show.add_argument("--trip-name")
    add_roadtrip_runtime(roadtrip_show)
    roadtrip_show.set_defaults(func=cmd_roadtrip_show)

    config = subcommands.add_parser("config", help="Show resolved config without printing tokens")
    config.set_defaults(func=cmd_config)

    categories = subcommands.add_parser("categories", help="Category API commands")
    categories_sub = categories.add_subparsers(dest="categories_command", required=True)
    categories_list = categories_sub.add_parser("list", help="List categories")
    categories_list.set_defaults(func=cmd_categories_list)

    place = subcommands.add_parser("place", help="Place API commands")
    place_sub = place.add_subparsers(dest="place_command", required=True)

    create = place_sub.add_parser("create", help="Create a place")
    create.add_argument("--json", help="JSON object, @file, or - for stdin")
    create.add_argument("--category")
    create.add_argument("--name")
    create.add_argument("--lat", type=float)
    create.add_argument("--lng", type=float)
    create.add_argument("--place")
    create.add_argument("--image")
    add_bool(create, "allowdog")
    create.add_argument("--description")
    create.add_argument("--price", type=float)
    create.add_argument("--duration", type=int)
    add_bool(create, "favorite")
    add_bool(create, "visited")
    add_bool(create, "restroom")
    create.add_argument("--gpx")
    create.add_argument("--gpx-file")
    create.set_defaults(func=cmd_place_create)

    google = place_sub.add_parser("google-search", help="Create a place by Google query, place URL, or short link")
    google.add_argument("--query", "-q", required=True)
    google.add_argument("--category")
    google.set_defaults(func=cmd_google_search)

    raw = subcommands.add_parser("raw", help="Call any by-token endpoint")
    raw.add_argument("method", choices=["GET", "POST", "PUT", "PATCH", "DELETE", "get", "post", "put", "patch", "delete"])
    raw.add_argument("path")
    raw.add_argument("--json", help="JSON value, @file, or - for stdin")
    raw.set_defaults(func=cmd_raw)
    return parser


def validate_required_create_args(args: argparse.Namespace) -> None:
    if getattr(args, "func", None) is not cmd_place_create or args.json:
        return
    missing = [name for name in ["category", "name", "lat", "lng", "place"] if getattr(args, name) is None]
    if missing:
        joined = ", ".join(f"--{name}" for name in missing)
        raise TripApiError(f"Missing required place fields: {joined}")


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        validate_required_create_args(args)
        args.func(args)
    except TripApiError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"error: invalid JSON: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
