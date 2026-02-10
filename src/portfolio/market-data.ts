const BINANCE_BASE = "https://api.binance.com";
const CACHE_TTL_MS = 30_000; // 30 seconds

interface CachedQuote {
  price: number;
  timestamp: number;
}

export class MarketData {
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

    const url = `${BINANCE_BASE}/api/v3/ticker/price?symbol=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "clawcapital-sandbox/1.0",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Binance API error (${res.status}): ${body}`);
    }

    const data = (await res.json()) as { symbol: string; price: string };
    const price = parseFloat(data.price);

    this.cache.set(key, { price, timestamp: Date.now() });
    return { symbol: key, price };
  }

  async fetchQuotes(symbols: string[]): Promise<Array<{ symbol: string; price: number }>> {
    // Check which symbols need fetching
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

    if (toFetch.length > 0) {
      // Binance supports bulk query with a JSON array of symbols
      const url = `${BINANCE_BASE}/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(toFetch))}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "clawcapital-sandbox/1.0",
        },
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Binance API error (${res.status}): ${body}`);
      }

      const data = (await res.json()) as Array<{ symbol: string; price: string }>;
      const now = Date.now();
      for (const item of data) {
        const price = parseFloat(item.price);
        this.cache.set(item.symbol, { price, timestamp: now });
        results.push({ symbol: item.symbol, price });
      }
    }

    return results;
  }
}
