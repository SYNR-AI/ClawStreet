export { WatchlistStore } from "./watchlist-store.js";
export type {
  WatchedTicker,
  IntelligenceItem,
  OpportunityItem,
  HeatLevel,
  TickerType,
  WatchlistStoreData,
} from "./watchlist-store.js";
export { Watchlist } from "./watchlist.js";

import type { TickerType } from "./watchlist-store.js";
import { MarketData } from "../portfolio/market-data.js";
import { StockMarketData } from "../portfolio/stock-market-data.js";
import { WatchlistStore } from "./watchlist-store.js";
import { Watchlist } from "./watchlist.js";

export interface WatchlistService {
  watchlist: Watchlist;
  marketData: MarketData;
  stockMarketData: StockMarketData;
}

let servicePromise: Promise<WatchlistService> | null = null;

export function getWatchlistService(): Promise<WatchlistService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      const store = new WatchlistStore();
      const watchlist = await Watchlist.create(store);
      const marketData = new MarketData();
      const stockMarketData = new StockMarketData();
      return { watchlist, marketData, stockMarketData };
    })();
  }
  return servicePromise;
}

export interface ActiveIntelItem {
  ticker: string;
  type: TickerType;
  price: number;
  eye: string;
  heat: string;
}

export interface EnrichedWatchlistData {
  intelligenceFeed: ReturnType<Watchlist["getIntelligenceFeed"]>;
  activeIntel: ActiveIntelItem[];
  opportunityRadar: ReturnType<Watchlist["getOpportunityRadar"]>;
}

export async function getEnrichedWatchlist(
  watchlist: Watchlist,
  marketData: MarketData,
  stockMarketData: StockMarketData,
): Promise<EnrichedWatchlistData> {
  const watched = watchlist.getWatchedTickers();

  const currentPrices: Record<string, number> = {};

  // Split tickers by type
  const cryptoTickers = watched.filter((w) => (w.type ?? "crypto") === "crypto");
  const stockTickers = watched.filter((w) => w.type === "stock");

  // Fetch crypto prices from Binance
  if (cryptoTickers.length > 0) {
    try {
      const symbols = cryptoTickers.map((w) =>
        w.ticker.endsWith("USDT") ? w.ticker : `${w.ticker}USDT`,
      );
      const quotes = await marketData.fetchQuotes(symbols);
      for (const q of quotes) {
        const original = q.symbol.endsWith("USDT") ? q.symbol.slice(0, -4) : q.symbol;
        currentPrices[original] = q.price;
        currentPrices[q.symbol] = q.price;
      }
    } catch {
      // Binance unavailable — crypto prices will be 0
    }
  }

  // Fetch stock prices from Yahoo Finance
  if (stockTickers.length > 0) {
    try {
      const symbols = stockTickers.map((w) => w.ticker);
      const quotes = await stockMarketData.fetchQuotes(symbols);
      for (const q of quotes) {
        currentPrices[q.symbol] = q.price;
      }
    } catch {
      // Yahoo Finance unavailable — stock prices will be 0
    }
  }

  const activeIntel: ActiveIntelItem[] = watched.map((w) => ({
    ticker: w.ticker,
    type: w.type ?? "crypto",
    price: currentPrices[w.ticker] ?? 0,
    eye: w.eye,
    heat: w.heat,
  }));

  return {
    intelligenceFeed: watchlist.getIntelligenceFeed(),
    activeIntel,
    opportunityRadar: watchlist.getOpportunityRadar(),
  };
}
