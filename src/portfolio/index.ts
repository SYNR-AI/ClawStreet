export { PortfolioStore } from "./portfolio-store.js";
export type { Holding, Transaction, PortfolioData } from "./portfolio-store.js";
export { Portfolio } from "./portfolio.js";
export { MarketData } from "./market-data.js";
export { TradingEngine } from "./trading-engine.js";
export type { TradeResult } from "./trading-engine.js";

import { MarketData } from "./market-data.js";
import { PortfolioStore } from "./portfolio-store.js";
import { Portfolio } from "./portfolio.js";
import { TradingEngine } from "./trading-engine.js";

export interface PortfolioService {
  portfolio: Portfolio;
  marketData: MarketData;
  tradingEngine: TradingEngine;
}

let servicePromise: Promise<PortfolioService> | null = null;

/** Lazily initialise and return the singleton portfolio service. Thread-safe via cached Promise. */
export function getPortfolioService(): Promise<PortfolioService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      const store = new PortfolioStore();
      const portfolio = await Portfolio.create(store);
      const marketData = new MarketData();
      const tradingEngine = new TradingEngine(portfolio, marketData);
      return { portfolio, marketData, tradingEngine };
    })();
  }
  return servicePromise;
}

export interface HoldingWithPnL {
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  pnl: number;
  pnlPercent: number;
}

export interface PortfolioSnapshot {
  cash: number;
  holdings: HoldingWithPnL[];
  totalValue: number;
  stockValue: number;
  transactionCount: number;
}

/**
 * Build an enriched snapshot with live Binance prices and per-holding P&L.
 * Gracefully falls back to average prices if market data is unavailable.
 */
export async function getEnrichedSnapshot(
  portfolio: Portfolio,
  marketData: MarketData,
): Promise<PortfolioSnapshot> {
  const snapshot = portfolio.getSnapshot();
  const tickers = Object.keys(snapshot.holdings);

  let currentPrices: Record<string, number> = {};
  if (tickers.length > 0) {
    try {
      const binanceSymbols = tickers.map((t) => (t.endsWith("USDT") ? t : `${t}USDT`));
      const quotes = await marketData.fetchQuotes(binanceSymbols);
      for (const q of quotes) {
        const originalTicker = q.symbol.endsWith("USDT") ? q.symbol.slice(0, -4) : q.symbol;
        currentPrices[originalTicker] = q.price;
        currentPrices[q.symbol] = q.price;
      }
    } catch {
      // Market data unavailable — fall back to average prices
    }
  }

  const valuation = portfolio.getPortfolioValue(currentPrices);

  const holdingsWithPnL: HoldingWithPnL[] = Object.entries(snapshot.holdings).map(
    ([ticker, holding]) => {
      const currentPrice = currentPrices[ticker] ?? holding.averagePrice;
      const marketValue = holding.quantity * currentPrice;
      const costBasis = holding.quantity * holding.averagePrice;
      const pnl = marketValue - costBasis;
      const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
      return {
        ticker,
        ...holding,
        currentPrice,
        marketValue,
        costBasis,
        pnl,
        pnlPercent,
      };
    },
  );

  return {
    cash: snapshot.cash,
    holdings: holdingsWithPnL,
    totalValue: valuation.totalValue,
    stockValue: valuation.stockValue,
    transactionCount: snapshot.transactionHistory.length,
  };
}
