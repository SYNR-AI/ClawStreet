export { PortfolioStore } from "./portfolio-store.js";
export type {
  Holding,
  Transaction,
  PortfolioData,
  HoldingMeta,
  DailySnapshot,
  AssetType,
  AssetClass,
} from "./portfolio-store.js";
export { Portfolio } from "./portfolio.js";
export { MarketData } from "./market-data.js";
export { StockMarketData } from "./stock-market-data.js";
export { TradingEngine } from "./trading-engine.js";
export type { TradeResult } from "./trading-engine.js";

import type { Transaction } from "./portfolio-store.js";
import { MarketData } from "./market-data.js";
import { PortfolioStore } from "./portfolio-store.js";
import { Portfolio } from "./portfolio.js";
import { StockMarketData } from "./stock-market-data.js";
import { TradingEngine } from "./trading-engine.js";

export interface PortfolioService {
  portfolio: Portfolio;
  marketData: MarketData;
  stockMarketData: StockMarketData;
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
      const stockMarketData = new StockMarketData();
      const tradingEngine = new TradingEngine(portfolio, marketData, stockMarketData);
      return { portfolio, marketData, stockMarketData, tradingEngine };
    })();
  }
  return servicePromise;
}

export interface HoldingWithPnL {
  ticker: string;
  type: "crypto" | "stock";
  assetClass?: "us_stock_spot" | "crypto_spot";
  productLine: "spot";
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  pnl: number;
  pnlPercent: number;
  thesis?: string;
  context?: string;
  history?: Transaction[];
}

export interface FuturesPositionSummary {
  ticker: string;
  productLine: "futures";
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  unrealizedPnl: number;
  roe: number;
  initialMargin: number;
  liquidationPrice: number;
}

export interface OptionsPositionSummary {
  symbol: string;
  productLine: "options";
  underlying: string;
  type: "call" | "put";
  strikePrice: number;
  expiryDate: string;
  contracts: number;
  premiumPaid: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  daysToExpiry: number;
}

export type AnyPositionSummary = HoldingWithPnL | FuturesPositionSummary | OptionsPositionSummary;

export interface PortfolioSnapshot {
  // Account
  cash: number;
  totalEquity: number;

  // Spot
  spotHoldings: HoldingWithPnL[];
  spotEquity: number;

  // Futures
  futuresPositions: FuturesPositionSummary[];
  futuresMarginUsed: number;
  futuresUnrealizedPnl: number;

  // Options
  optionsPositions: OptionsPositionSummary[];
  optionsValue: number;

  // Aggregated
  allPositions: AnyPositionSummary[];
  transactionCount: number;
  pnlDay?: number;
  pnlDayPercent?: number;
}

/**
 * Build an enriched snapshot aggregating all product lines:
 * spot holdings, futures positions, and options positions.
 */
export async function getEnrichedSnapshot(
  portfolio: Portfolio,
  marketData: MarketData,
  stockMarketData?: StockMarketData,
): Promise<PortfolioSnapshot> {
  const snapshot = portfolio.getSnapshot();
  const keys = Object.keys(snapshot.holdings);
  const tickerTypes = snapshot.tickerTypes ?? {};

  const currentPrices: Record<string, number> = {};

  // Split by asset type
  const cryptoTickers = keys.filter((t) => (tickerTypes[t] ?? "crypto") === "crypto");
  const stockTickers = keys.filter((t) => tickerTypes[t] === "stock");

  // Fetch crypto prices from Binance
  if (cryptoTickers.length > 0) {
    try {
      const binanceSymbols = cryptoTickers.map((t) => (t.endsWith("USDT") ? t : `${t}USDT`));
      const quotes = await marketData.fetchQuotes(binanceSymbols);
      for (const q of quotes) {
        const originalTicker = q.symbol.endsWith("USDT") ? q.symbol.slice(0, -4) : q.symbol;
        currentPrices[originalTicker] = q.price;
        currentPrices[q.symbol] = q.price;
      }
    } catch {
      // Binance unavailable — fall back to average prices
    }
  }

  // Fetch stock prices from Yahoo Finance
  if (stockTickers.length > 0 && stockMarketData) {
    try {
      const quotes = await stockMarketData.fetchQuotes(stockTickers);
      for (const q of quotes) {
        currentPrices[q.symbol] = q.price;
      }
    } catch {
      // Yahoo Finance unavailable — fall back to average prices
    }
  }

  const valuation = portfolio.getPortfolioValue(currentPrices);

  // Spot holdings
  const spotHoldings: HoldingWithPnL[] = keys.map((key) => {
    const holding = snapshot.holdings[key];
    const currentPrice = currentPrices[key] ?? holding.averagePrice;
    const costBasis = holding.quantity * holding.averagePrice;
    const marketValue = holding.quantity * currentPrice;
    const pnl = marketValue - costBasis;
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

    const meta = snapshot.holdingMeta?.[key];
    const history = snapshot.transactionHistory
      .filter((t) => t.ticker === key && ["buy", "sell"].includes(t.type))
      .slice(-10)
      .toReversed();

    return {
      ticker: key,
      type: (tickerTypes[key] ?? "crypto") as "crypto" | "stock",
      assetClass: holding.assetClass,
      productLine: "spot" as const,
      quantity: holding.quantity,
      averagePrice: holding.averagePrice,
      currentPrice,
      marketValue,
      costBasis,
      pnl,
      pnlPercent,
      ...(meta?.thesis ? { thesis: meta.thesis } : {}),
      ...(meta?.context ? { context: meta.context } : {}),
      history,
    };
  });

  // Futures positions (lazy load to avoid circular deps)
  let futuresPositions: FuturesPositionSummary[] = [];
  let futuresMarginUsed = 0;
  let futuresUnrealizedPnl = 0;
  try {
    const { getFuturesService } = await import("../futures/index.js");
    const { futuresEngine } = await getFuturesService(portfolio, marketData);
    const positions = await futuresEngine.getPositions();
    const account = futuresEngine.getAccount();
    futuresMarginUsed = account.totalMarginUsed;
    futuresUnrealizedPnl = account.totalUnrealizedPnl;
    futuresPositions = positions.map((p) => ({
      ticker: p.ticker,
      productLine: "futures" as const,
      side: p.side,
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      markPrice: p.markPrice,
      leverage: p.leverage,
      unrealizedPnl: p.unrealizedPnl,
      roe: p.roe,
      initialMargin: p.initialMargin,
      liquidationPrice: p.liquidationPrice,
    }));
  } catch {
    // Futures service not available
  }

  // Options positions (lazy load)
  let optionsPositions: OptionsPositionSummary[] = [];
  let optionsValue = 0;
  if (stockMarketData) {
    try {
      const { getOptionsService, formatOptionSymbol } = await import("../options/index.js");
      const { optionsEngine } = await getOptionsService(portfolio, stockMarketData);
      const positions = await optionsEngine.getPositions();
      optionsPositions = positions.map((p) => ({
        symbol: formatOptionSymbol(p.contract),
        productLine: "options" as const,
        underlying: p.contract.underlying,
        type: p.contract.type,
        strikePrice: p.contract.strikePrice,
        expiryDate: p.expiryDate,
        contracts: p.contracts,
        premiumPaid: p.premiumPaid,
        currentValue: p.currentValue,
        unrealizedPnl: p.unrealizedPnl,
        unrealizedPnlPercent: p.unrealizedPnlPercent,
        daysToExpiry: p.daysToExpiry,
      }));
      optionsValue = positions.reduce((sum, p) => sum + p.currentValue, 0);
    } catch {
      // Options service not available
    }
  }

  // Total equity = cash + spot + futures (margin + pnl) + options value
  const totalEquity =
    valuation.cash + valuation.spotEquity + futuresMarginUsed + futuresUnrealizedPnl + optionsValue;

  // All positions combined (sorted by absolute P&L descending)
  const allPositions: AnyPositionSummary[] = [
    ...spotHoldings,
    ...futuresPositions,
    ...optionsPositions,
  ].toSorted((a, b) => {
    const pnlA = "pnl" in a ? a.pnl : a.unrealizedPnl;
    const pnlB = "pnl" in b ? b.pnl : b.unrealizedPnl;
    return Math.abs(pnlB) - Math.abs(pnlA);
  });

  // Compute Day P/L from the most recent daily snapshot
  const dailySnapshots = snapshot.dailySnapshots ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const previousSnapshot = [...dailySnapshots].toReversed().find((s) => s.date !== today);
  let pnlDay: number | undefined;
  let pnlDayPercent: number | undefined;
  if (previousSnapshot) {
    pnlDay = totalEquity - previousSnapshot.totalValue;
    pnlDayPercent =
      previousSnapshot.totalValue > 0 ? (pnlDay / previousSnapshot.totalValue) * 100 : 0;
  }

  // Auto-record today's snapshot
  void portfolio.recordDailySnapshot(totalEquity);

  return {
    cash: valuation.cash,
    totalEquity,

    spotHoldings,
    spotEquity: valuation.spotEquity,

    futuresPositions,
    futuresMarginUsed,
    futuresUnrealizedPnl,

    optionsPositions,
    optionsValue,

    allPositions,
    transactionCount: snapshot.transactionHistory.length,
    ...(pnlDay !== undefined ? { pnlDay, pnlDayPercent } : {}),
  };
}
