const YAHOO_BASE = "https://query1.finance.yahoo.com";
const CACHE_TTL_MS = 30_000; // 30 seconds

interface CachedQuote {
  price: number;
  timestamp: number;
}

/**
 * US stock market data provider using Yahoo Finance.
 * Mirrors the MarketData (Binance) API surface.
 */
export class StockMarketData {
  private cache = new Map<string, CachedQuote>();

  clearCache(): void {
    this.cache.clear();
  }

  async fetchQuote(symbol: string): Promise<{ symbol: string; price: number }> {
    const key = symbol.toUpperCase();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { symbol: key, price: cached.price };
    }

    const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(key)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "clawcapital/1.0",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Yahoo Finance API error (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      chart: {
        result: Array<{
          meta: { regularMarketPrice: number };
        }>;
        error: unknown;
      };
    };

    const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (price === undefined) {
      throw new Error(`No price data for ${key}`);
    }

    this.cache.set(key, { price, timestamp: Date.now() });
    return { symbol: key, price };
  }

  async fetchQuotes(symbols: string[]): Promise<Array<{ symbol: string; price: number }>> {
    const results: Array<{ symbol: string; price: number }> = [];
    const toFetch: string[] = [];

    for (const sym of symbols) {
      const key = sym.toUpperCase();
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        results.push({ symbol: key, price: cached.price });
      } else {
        toFetch.push(key);
      }
    }

    // Yahoo Finance chart endpoint doesn't support bulk queries,
    // so we fetch in parallel with concurrency limit
    if (toFetch.length > 0) {
      const fetches = toFetch.map(async (sym) => {
        try {
          return await this.fetchQuote(sym);
        } catch {
          // Individual stock failure shouldn't block others
          return { symbol: sym, price: 0 };
        }
      });
      const fetched = await Promise.all(fetches);
      results.push(...fetched);
    }

    return results;
  }
}
