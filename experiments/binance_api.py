#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Fetch latest price for a symbol from Binance Spot REST API.

Docs:
https://developers.binance.com/docs/zh-CN/binance-spot-api-docs/rest-api/general-api-information

Endpoint used (public, no API key needed):
GET /api/v3/ticker/price?symbol=TSLAUSDT
"""

from __future__ import annotations

import sys
import time
import json
from typing import Any, Dict, Optional
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

BASE_URL = "https://api.binance.com"
ENDPOINT = "/api/v3/ticker/price"


def fetch_price(symbol: str, timeout: float = 10.0) -> Dict[str, Any]:
    """
    Returns a dict like: {"symbol": "BTCUSDT", "price": "12345.67000000"}
    Raises RuntimeError with a helpful message on errors.
    """
    params = {"symbol": symbol.upper()}
    url = f"{BASE_URL}{ENDPOINT}?{urlencode(params)}"

    req = Request(
        url,
        method="GET",
        headers={
            "Accept": "application/json",
            "User-Agent": "binance-spot-price-fetcher/1.0",
        },
    )

    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw)
            if not isinstance(data, dict) or "price" not in data:
                raise RuntimeError(f"Unexpected response: {data}")
            return data

    except HTTPError as e:
        # Binance often returns JSON error bodies like:
        # {"code":-1121,"msg":"Invalid symbol."}
        try:
            body = e.read().decode("utf-8")
            j = json.loads(body)
            raise RuntimeError(f"HTTP {e.code} from Binance: {j}") from None
        except Exception:
            raise RuntimeError(f"HTTP {e.code} from Binance: {e.reason}") from None

    except URLError as e:
        raise RuntimeError(f"Network error: {e.reason}") from None

    except json.JSONDecodeError:
        raise RuntimeError("Failed to parse JSON response from Binance.") from None


def main(argv: Optional[list[str]] = None) -> int:
    argv = argv or sys.argv[1:]
    symbol = argv[0].upper() if len(argv) >= 1 else "BTCUSDT"

    try:
        data = fetch_price(symbol)
        ts = int(time.time())
        print(f"{ts}\t{data['symbol']}\t{data['price']}")
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
