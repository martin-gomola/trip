import logging
from datetime import datetime, timedelta
from typing import Annotated

import httpx
from fastapi import APIRouter, Query

router = APIRouter(prefix="/api/currency", tags=["currency"])

logger = logging.getLogger(__name__)

CACHE_DURATION = timedelta(hours=6)
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{pair}=X"
CURRENCY_ALIASES = {
    "$": "USD",
    "US$": "USD",
    "€": "EUR",
    "£": "GBP",
    "KČ": "CZK",
    "KC": "CZK",
    "KORUNA": "CZK",
    "฿": "THB",
    "BAHT": "THB",
    "₫": "VND",
    "DONG": "VND",
}
RATE_CACHE: dict[str, tuple[float, datetime]] = {}


def _normalize_currency(value: str | None) -> str:
    if not value:
        return ""
    normalized = value.strip().upper()
    if normalized in CURRENCY_ALIASES:
        return CURRENCY_ALIASES[normalized]
    return "".join(ch for ch in normalized if "A" <= ch <= "Z")[:3]


async def _fetch_rate(from_currency: str, to_currency: str) -> float | None:
    if from_currency == to_currency:
        return 1.0

    cache_key = f"{from_currency}_{to_currency}"
    cached = RATE_CACHE.get(cache_key)
    if cached and datetime.utcnow() - cached[1] < CACHE_DURATION:
        return cached[0]

    direct_rate = await _fetch_yahoo_pair(f"{from_currency}{to_currency}")
    if direct_rate:
        RATE_CACHE[cache_key] = (direct_rate, datetime.utcnow())
        return direct_rate

    inverse_rate = await _fetch_yahoo_pair(f"{to_currency}{from_currency}")
    if inverse_rate:
        rate = 1 / inverse_rate
        RATE_CACHE[cache_key] = (rate, datetime.utcnow())
        return rate

    return None


async def _fetch_yahoo_pair(pair: str) -> float | None:
    try:
        async with httpx.AsyncClient(
            timeout=8,
            headers={"User-Agent": "Mozilla/5.0 (compatible; TRIP/1; Yahoo Finance currency lookup)"},
        ) as client:
            response = await client.get(YAHOO_CHART_URL.format(pair=pair))
            response.raise_for_status()
            result = response.json()["chart"]["result"][0]
            quote = result["meta"].get("regularMarketPrice") or result["meta"].get("previousClose")
    except (httpx.HTTPError, KeyError, IndexError, TypeError) as exc:
        logger.warning("Currency rate lookup failed for %s: %s", pair, exc)
        return None

    if not quote:
        return None

    return float(quote)


@router.get("/rates")
async def get_currency_rates(
    base: str,
    currencies: Annotated[list[str], Query()] = [],
):
    base_code = _normalize_currency(base)
    requested = {_normalize_currency(currency) for currency in currencies}
    requested.discard("")

    rates: dict[str, float] = {}
    missing: list[str] = []
    for currency in sorted(requested):
        rate = await _fetch_rate(currency, base_code)
        if rate is None:
            missing.append(currency)
        else:
            rates[currency] = rate

    return {
        "base": base_code,
        "rates": rates,
        "missing": missing,
        "source": "Yahoo Finance",
    }
