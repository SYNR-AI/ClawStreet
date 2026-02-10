/**
 * Trading correctness tests for all 4 product lines:
 *   1. US Stock Spot
 *   2. Crypto Spot
 *   3. Crypto Perpetual Futures
 *   4. US Stock Options
 *
 * All market data is mocked to avoid real API calls.
 * Each test group uses isolated stores (temp dirs via test setup).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MarketData } from "./market-data.js";
import type { StockMarketData } from "./stock-market-data.js";
import { FuturesEngine } from "../futures/futures-engine.js";
import { FuturesStore } from "../futures/futures-store.js";
import { checkFuturesLiquidation } from "../futures/liquidation-engine.js";
import {
  calcInitialMargin,
  calcUnrealizedPnl,
  calcLiquidationPrice,
  calcMaintenanceMarginRate,
} from "../futures/margin-calculator.js";
import { OptionsEngine } from "../options/options-engine.js";
import {
  calcPremium,
  getImpliedVol,
  calcIntrinsicValue,
  calcDaysToExpiry,
} from "../options/options-pricing.js";
import { OptionsStore } from "../options/options-store.js";
import { PortfolioStore } from "./portfolio-store.js";
import { Portfolio } from "./portfolio.js";
import { TradingEngine } from "./trading-engine.js";

// ── Helpers ──

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "claw-test-"));
}

function cleanupDir(dir: string) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/** Create a mock MarketData that returns configured prices. */
function createMockMarketData(prices: Record<string, number>): MarketData {
  return {
    fetchQuote: vi.fn(async (symbol: string) => {
      const normalized = symbol.toUpperCase();
      const price = prices[normalized];
      if (price === undefined) {
        throw new Error(`No mock price for ${normalized}`);
      }
      return { symbol: normalized, price };
    }),
    fetchQuotes: vi.fn(async (symbols: string[]) => {
      return symbols.map((s) => {
        const normalized = s.toUpperCase();
        return { symbol: normalized, price: prices[normalized] ?? 0 };
      });
    }),
    clearCache: vi.fn(),
  } as unknown as MarketData;
}

/** Create a mock StockMarketData that returns configured prices. */
function createMockStockMarketData(prices: Record<string, number>): StockMarketData {
  return {
    fetchQuote: vi.fn(async (symbol: string) => {
      const normalized = symbol.toUpperCase();
      const price = prices[normalized];
      if (price === undefined) {
        throw new Error(`No mock price for ${normalized}`);
      }
      return { symbol: normalized, price };
    }),
    fetchQuotes: vi.fn(async (symbols: string[]) => {
      return symbols.map((s) => {
        const normalized = s.toUpperCase();
        return { symbol: normalized, price: prices[normalized] ?? 0 };
      });
    }),
    clearCache: vi.fn(),
  } as unknown as StockMarketData;
}

/** Build a future expiry date N days from now. */
function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/** Build a past expiry date N days ago. */
function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

// ════════════════════════════════════════════════════════════════════
// 1. US Stock Spot
// ════════════════════════════════════════════════════════════════════

describe("US Stock Spot Trading", () => {
  let tmpDir: string;
  let portfolio: Portfolio;
  let engine: TradingEngine;
  let mockStockData: StockMarketData;
  let mockCryptoData: MarketData;

  beforeEach(async () => {
    tmpDir = createTempDir();
    const store = new PortfolioStore(tmpDir);
    portfolio = await Portfolio.create(store);
    mockStockData = createMockStockMarketData({ AAPL: 150, NVDA: 800, TSLA: 250 });
    mockCryptoData = createMockMarketData({});
    engine = new TradingEngine(portfolio, mockCryptoData, mockStockData);
  });

  it("should buy stock and deduct cash correctly", async () => {
    const initialCash = portfolio.cash; // 100_000
    const result = await engine.executeBuy("AAPL", 10, "bullish thesis", "stock");

    expect(result.success).toBe(true);
    expect(result.transaction).toBeDefined();
    expect(result.transaction!.ticker).toBe("AAPL");
    expect(result.transaction!.quantity).toBe(10);
    expect(result.transaction!.price).toBe(150);

    // Cash deducted: 10 × $150 = $1500
    expect(portfolio.cash).toBe(initialCash - 1500);

    // Holding created
    const holdings = portfolio.holdings;
    expect(holdings["AAPL"]).toBeDefined();
    expect(holdings["AAPL"].quantity).toBe(10);
    expect(holdings["AAPL"].averagePrice).toBe(150);
    expect(holdings["AAPL"].assetClass).toBe("us_stock_spot");
  });

  it("should compute weighted average price on multiple buys", async () => {
    await engine.executeBuy("AAPL", 10, undefined, "stock"); // 10 @ $150
    // Change mock price for second buy
    (mockStockData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "AAPL",
      price: 160,
    });
    await engine.executeBuy("AAPL", 10, undefined, "stock"); // 10 @ $160

    const h = portfolio.holdings["AAPL"];
    expect(h.quantity).toBe(20);
    // Weighted average: (10×150 + 10×160) / 20 = 155
    expect(h.averagePrice).toBe(155);
  });

  it("should sell stock and return cash correctly", async () => {
    await engine.executeBuy("AAPL", 20, undefined, "stock");
    const cashAfterBuy = portfolio.cash;

    const result = await engine.executeSell("AAPL", 10, "taking profits", "stock");
    expect(result.success).toBe(true);

    // Cash returned: 10 × $150 = $1500
    expect(portfolio.cash).toBe(cashAfterBuy + 1500);

    // 10 shares remaining
    expect(portfolio.holdings["AAPL"].quantity).toBe(10);
  });

  it("should sell all shares and remove holding", async () => {
    await engine.executeBuy("AAPL", 10, undefined, "stock");
    await engine.executeSell("AAPL", 10, undefined, "stock");

    // Holding completely removed
    expect(portfolio.holdings["AAPL"]).toBeUndefined();
  });

  it("should reject sell when insufficient shares", async () => {
    await engine.executeBuy("AAPL", 5, undefined, "stock");
    const result = await engine.executeSell("AAPL", 10, undefined, "stock");

    expect(result.success).toBe(false);
    expect(result.message).toContain("Insufficient");
  });

  it("should reject buy when insufficient cash", async () => {
    // Try to buy $120,000 worth of NVDA (150 shares × $800 = $120,000 > $100,000 cash)
    const result = await engine.executeBuy("NVDA", 150, undefined, "stock");

    expect(result.success).toBe(false);
    expect(result.message).toContain("Insufficient cash");
  });

  it("should reject zero or negative quantity", async () => {
    const r1 = await engine.executeBuy("AAPL", 0, undefined, "stock");
    expect(r1.success).toBe(false);

    const r2 = await engine.executeBuy("AAPL", -5, undefined, "stock");
    expect(r2.success).toBe(false);

    const r3 = await engine.executeSell("AAPL", 0, undefined, "stock");
    expect(r3.success).toBe(false);
  });

  it("should record transaction history with reasoning", async () => {
    await engine.executeBuy("AAPL", 10, "AI bullish signal", "stock");
    await engine.executeSell("AAPL", 5, "partial take-profit", "stock");

    const history = portfolio.transactionHistory;
    expect(history).toHaveLength(2);

    expect(history[0].type).toBe("buy");
    expect(history[0].reasoning).toBe("AI bullish signal");

    expect(history[1].type).toBe("sell");
    expect(history[1].reasoning).toBe("partial take-profit");
  });

  it("should normalize ticker to uppercase", async () => {
    const result = await engine.executeBuy("aapl", 5, undefined, "stock");
    expect(result.success).toBe(true);
    expect(result.transaction!.ticker).toBe("AAPL");
    expect(portfolio.holdings["AAPL"]).toBeDefined();
  });

  afterEach(() => cleanupDir(tmpDir));
});

// ════════════════════════════════════════════════════════════════════
// 2. Crypto Spot
// ════════════════════════════════════════════════════════════════════

describe("Crypto Spot Trading", () => {
  let tmpDir: string;
  let portfolio: Portfolio;
  let engine: TradingEngine;
  let mockCryptoData: MarketData;

  beforeEach(async () => {
    tmpDir = createTempDir();
    const store = new PortfolioStore(tmpDir);
    portfolio = await Portfolio.create(store);
    mockCryptoData = createMockMarketData({ BTCUSDT: 65000, ETHUSDT: 3500, SOLUSDT: 180 });
    const mockStockData = createMockStockMarketData({});
    engine = new TradingEngine(portfolio, mockCryptoData, mockStockData);
  });

  it("should buy crypto and create holding with crypto_spot assetClass", async () => {
    const result = await engine.executeBuy("BTC", 0.5, "BTC accumulation", "crypto");

    expect(result.success).toBe(true);
    expect(result.transaction!.price).toBe(65000);

    // Cash deducted: 0.5 × $65,000 = $32,500
    expect(portfolio.cash).toBe(100_000 - 32_500);

    const h = portfolio.holdings["BTC"];
    expect(h.quantity).toBe(0.5);
    expect(h.averagePrice).toBe(65000);
    expect(h.assetClass).toBe("crypto_spot");
  });

  it("should append USDT suffix for Binance API", async () => {
    await engine.executeBuy("ETH", 1, undefined, "crypto");

    // Should have called fetchQuote with "ETHUSDT"
    expect(mockCryptoData.fetchQuote).toHaveBeenCalledWith("ETHUSDT");
  });

  it("should not double-add USDT suffix", async () => {
    // If ticker already ends with USDT
    mockCryptoData = createMockMarketData({ SOLUSDT: 180 });
    const mockStockData = createMockStockMarketData({});
    engine = new TradingEngine(portfolio, mockCryptoData, mockStockData);

    // The engine normalizes to uppercase, then checks USDT suffix
    await engine.executeBuy("SOLUSDT", 10, undefined, "crypto");
    expect(mockCryptoData.fetchQuote).toHaveBeenCalledWith("SOLUSDT");
  });

  it("should sell crypto and return cash", async () => {
    await engine.executeBuy("ETH", 5, undefined, "crypto");
    const cashAfterBuy = portfolio.cash;

    // Simulate price increase for sell
    (mockCryptoData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "ETHUSDT",
      price: 4000,
    });
    const result = await engine.executeSell("ETH", 2, "partial sell", "crypto");

    expect(result.success).toBe(true);
    // Cash returned: 2 × $4000 = $8000
    expect(portfolio.cash).toBe(cashAfterBuy + 8000);
    expect(portfolio.holdings["ETH"].quantity).toBe(3);
  });

  it("should handle failed price fetch gracefully", async () => {
    const badData = createMockMarketData({});
    const mockStockData = createMockStockMarketData({});
    const badEngine = new TradingEngine(portfolio, badData, mockStockData);

    const result = await badEngine.executeBuy("UNKNOWN", 1, undefined, "crypto");
    expect(result.success).toBe(false);
    expect(result.message).toContain("Failed to fetch");
  });

  afterEach(() => cleanupDir(tmpDir));
});

// ════════════════════════════════════════════════════════════════════
// 3. Crypto Perpetual Futures
// ════════════════════════════════════════════════════════════════════

describe("Crypto Perpetual Futures Trading", () => {
  let tmpDir: string;
  let portfolio: Portfolio;
  let futuresEngine: FuturesEngine;
  let mockMarketData: MarketData;

  beforeEach(async () => {
    tmpDir = createTempDir();
    const portfolioStore = new PortfolioStore(tmpDir);
    portfolio = await Portfolio.create(portfolioStore);
    mockMarketData = createMockMarketData({ BTCUSDT: 60000, ETHUSDT: 3000 });
    const futuresStore = new FuturesStore(tmpDir);
    futuresEngine = await FuturesEngine.create(futuresStore, mockMarketData, portfolio);
  });

  // ── Open Long ──

  it("should open a long position and deduct margin from cash", async () => {
    const initialCash = portfolio.cash; // 100_000
    const result = await futuresEngine.openLong("BTC", 1, 10);

    expect(result.success).toBe(true);
    expect(result.position).toBeDefined();

    const pos = result.position!;
    expect(pos.ticker).toBe("BTC");
    expect(pos.side).toBe("long");
    expect(pos.quantity).toBe(1);
    expect(pos.entryPrice).toBe(60000);
    expect(pos.leverage).toBe(10);
    expect(pos.assetClass).toBe("crypto_perp");
    expect(pos.marginMode).toBe("isolated");

    // Initial margin = 60000 × 1 / 10 = 6000
    const expectedMargin = calcInitialMargin(1, 60000, 10);
    expect(pos.initialMargin).toBe(expectedMargin);
    expect(pos.initialMargin).toBe(6000);

    // Cash reduced by margin
    expect(portfolio.cash).toBe(initialCash - 6000);
  });

  // ── Open Short ──

  it("should open a short position correctly", async () => {
    const result = await futuresEngine.openShort("ETH", 10, 5);

    expect(result.success).toBe(true);
    const pos = result.position!;
    expect(pos.side).toBe("short");
    expect(pos.quantity).toBe(10);
    expect(pos.entryPrice).toBe(3000);
    expect(pos.leverage).toBe(5);

    // Initial margin = 3000 × 10 / 5 = 6000
    expect(pos.initialMargin).toBe(6000);
    expect(portfolio.cash).toBe(100_000 - 6000);
  });

  // ── Default Leverage ──

  it("should use default leverage (20x) when not specified", async () => {
    const result = await futuresEngine.openLong("BTC", 0.1);

    expect(result.success).toBe(true);
    expect(result.position!.leverage).toBe(20);

    // Margin = 60000 × 0.1 / 20 = 300
    expect(result.position!.initialMargin).toBe(300);
  });

  // ── Liquidation Price ──

  it("should calculate correct liquidation price for long", async () => {
    const result = await futuresEngine.openLong("BTC", 1, 10);
    const pos = result.position!;

    const notional = 60000 * 1;
    const mmRate = calcMaintenanceMarginRate(notional);
    const expectedLiq = calcLiquidationPrice(60000, 10, mmRate, "long");

    expect(pos.liquidationPrice).toBeCloseTo(expectedLiq, 2);
    // Long liq price should be below entry price
    expect(pos.liquidationPrice).toBeLessThan(pos.entryPrice);
  });

  it("should calculate correct liquidation price for short", async () => {
    const result = await futuresEngine.openShort("BTC", 1, 10);
    const pos = result.position!;

    const notional = 60000 * 1;
    const mmRate = calcMaintenanceMarginRate(notional);
    const expectedLiq = calcLiquidationPrice(60000, 10, mmRate, "short");

    expect(pos.liquidationPrice).toBeCloseTo(expectedLiq, 2);
    // Short liq price should be above entry price
    expect(pos.liquidationPrice).toBeGreaterThan(pos.entryPrice);
  });

  // ── Close Position (Full) ──

  it("should close a long position with profit", async () => {
    const { position } = await futuresEngine.openLong("BTC", 1, 10);
    const cashAfterOpen = portfolio.cash; // 100_000 - 6000 = 94_000

    // Price rises to 65000
    (mockMarketData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "BTCUSDT",
      price: 65000,
    });

    const closeResult = await futuresEngine.closePosition(position!.id);
    expect(closeResult.success).toBe(true);

    // PnL = (65000 - 60000) × 1 = 5000
    expect(closeResult.pnl).toBe(5000);

    // Cash returned = margin (6000) + pnl (5000) = 11000
    expect(portfolio.cash).toBe(cashAfterOpen + 6000 + 5000);

    // Position removed
    const positions = futuresEngine.getPositionsRaw();
    expect(positions).toHaveLength(0);
  });

  it("should close a short position with profit", async () => {
    const { position } = await futuresEngine.openShort("BTC", 1, 10);
    const cashAfterOpen = portfolio.cash;

    // Price drops to 55000
    (mockMarketData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "BTCUSDT",
      price: 55000,
    });

    const closeResult = await futuresEngine.closePosition(position!.id);
    expect(closeResult.success).toBe(true);

    // PnL = (60000 - 55000) × 1 = 5000
    expect(closeResult.pnl).toBe(5000);
    expect(portfolio.cash).toBe(cashAfterOpen + 6000 + 5000);
  });

  it("should close a long position with loss", async () => {
    const { position } = await futuresEngine.openLong("BTC", 1, 10);
    const cashAfterOpen = portfolio.cash;

    // Price drops to 58000
    (mockMarketData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "BTCUSDT",
      price: 58000,
    });

    const closeResult = await futuresEngine.closePosition(position!.id);
    expect(closeResult.success).toBe(true);

    // PnL = (58000 - 60000) × 1 = -2000
    expect(closeResult.pnl).toBe(-2000);

    // Cash returned = max(0, margin + pnl) = max(0, 6000 - 2000) = 4000
    expect(portfolio.cash).toBe(cashAfterOpen + 4000);
  });

  // ── Partial Close ──

  it("should partially close a position", async () => {
    const { position } = await futuresEngine.openLong("BTC", 2, 10);
    // Margin = 60000 × 2 / 10 = 12000

    // Price rises to 62000
    (mockMarketData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "BTCUSDT",
      price: 62000,
    });

    const closeResult = await futuresEngine.closePosition(position!.id, 1);
    expect(closeResult.success).toBe(true);

    // PnL for 1 unit = (62000 - 60000) × 1 = 2000
    expect(closeResult.pnl).toBe(2000);

    // Position still exists with 1 unit remaining
    const positions = futuresEngine.getPositionsRaw();
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(1);

    // Margin proportionally reduced: 12000 × (1/2) = 6000 released
    expect(positions[0].initialMargin).toBe(6000);
  });

  // ── Insufficient Margin ──

  it("should reject position when insufficient cash for margin", async () => {
    // Try to open a huge position: 10 BTC @ $60,000, 2x leverage = $300,000 margin
    const result = await futuresEngine.openLong("BTC", 10, 2);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Insufficient balance");
  });

  // ── Leverage Validation ──

  it("should reject invalid leverage", async () => {
    const r1 = await futuresEngine.openLong("BTC", 1, 0);
    expect(r1.success).toBe(false);

    const r2 = await futuresEngine.openLong("BTC", 1, 151);
    expect(r2.success).toBe(false);
  });

  // ── Set Leverage ──

  it("should set leverage for a ticker", async () => {
    const result = await futuresEngine.setLeverage("BTC", 50);
    expect(result.success).toBe(true);

    // Now opening without specifying leverage should use 50x
    const openResult = await futuresEngine.openLong("BTC", 0.1);
    expect(openResult.position!.leverage).toBe(50);
  });

  it("should reject setting leverage when position exists", async () => {
    await futuresEngine.openLong("BTC", 0.1, 10);
    const result = await futuresEngine.setLeverage("BTC", 50);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Cannot change leverage");
  });

  // ── Liquidation ──

  it("should liquidate a long position when mark price hits liquidation price", async () => {
    const { position } = await futuresEngine.openLong("BTC", 1, 10);
    const liqPrice = position!.liquidationPrice;

    const broadcastSpy = vi.fn();

    // Set mock to return a price at/below liquidation
    (mockMarketData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValue({
      symbol: "BTCUSDT",
      price: liqPrice - 100,
    });

    await checkFuturesLiquidation(futuresEngine, mockMarketData, broadcastSpy);

    // Position should be removed
    expect(futuresEngine.getPositionsRaw()).toHaveLength(0);

    // Broadcast should have been called
    expect(broadcastSpy).toHaveBeenCalledWith(
      "futures.liquidation",
      expect.objectContaining({
        ticker: "BTC",
        side: "long",
      }),
    );
  });

  it("should liquidate a short position when mark price hits liquidation price", async () => {
    const { position } = await futuresEngine.openShort("BTC", 1, 10);
    const liqPrice = position!.liquidationPrice;

    // Set mock to return a price at/above liquidation
    (mockMarketData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValue({
      symbol: "BTCUSDT",
      price: liqPrice + 100,
    });

    await checkFuturesLiquidation(futuresEngine, mockMarketData);

    expect(futuresEngine.getPositionsRaw()).toHaveLength(0);
  });

  it("should NOT liquidate when price is within safe range", async () => {
    await futuresEngine.openLong("BTC", 1, 10);

    // Price drops a bit but stays above liquidation
    (mockMarketData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValue({
      symbol: "BTCUSDT",
      price: 59000,
    });

    await checkFuturesLiquidation(futuresEngine, mockMarketData);

    expect(futuresEngine.getPositionsRaw()).toHaveLength(1);
  });

  // ── Account Summary ──

  it("should return correct account summary", async () => {
    await futuresEngine.openLong("BTC", 1, 10);
    await futuresEngine.openShort("ETH", 5, 5);

    const account = futuresEngine.getAccount();
    // BTC margin = 60000/10 = 6000, ETH margin = 3000*5/5 = 3000
    expect(account.totalMarginUsed).toBe(6000 + 3000);
    expect(account.availableBalance).toBe(portfolio.cash);
  });

  // ── Transactions ──

  it("should record futures transactions", async () => {
    const { position } = await futuresEngine.openLong("BTC", 1, 10);

    (mockMarketData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "BTCUSDT",
      price: 62000,
    });
    await futuresEngine.closePosition(position!.id);

    const txs = futuresEngine.getTransactions();
    expect(txs).toHaveLength(2);
    expect(txs[0].type).toBe("close_long"); // Most recent first
    expect(txs[1].type).toBe("open_long");
  });

  afterEach(() => cleanupDir(tmpDir));
});

// ════════════════════════════════════════════════════════════════════
// 4. Margin Calculator (unit tests)
// ════════════════════════════════════════════════════════════════════

describe("Margin Calculator", () => {
  it("should calculate initial margin correctly", () => {
    // 1 BTC @ $60,000, 10x → $6,000
    expect(calcInitialMargin(1, 60000, 10)).toBe(6000);
    // 0.5 BTC @ $60,000, 20x → $1,500
    expect(calcInitialMargin(0.5, 60000, 20)).toBe(1500);
  });

  it("should apply tiered maintenance margin rates", () => {
    expect(calcMaintenanceMarginRate(10000)).toBe(0.004); // < $50k → 0.4%
    expect(calcMaintenanceMarginRate(100000)).toBe(0.005); // < $250k → 0.5%
    expect(calcMaintenanceMarginRate(500000)).toBe(0.01); // < $1M → 1.0%
    expect(calcMaintenanceMarginRate(2000000)).toBe(0.025); // ≥ $1M → 2.5%
  });

  it("should calculate unrealized PnL for long", () => {
    // Long 1 BTC: entry $60k, mark $65k → +$5k
    expect(calcUnrealizedPnl("long", 1, 60000, 65000)).toBe(5000);
    // Long 1 BTC: entry $60k, mark $55k → -$5k
    expect(calcUnrealizedPnl("long", 1, 60000, 55000)).toBe(-5000);
  });

  it("should calculate unrealized PnL for short", () => {
    // Short 1 BTC: entry $60k, mark $55k → +$5k
    expect(calcUnrealizedPnl("short", 1, 60000, 55000)).toBe(5000);
    // Short 1 BTC: entry $60k, mark $65k → -$5k
    expect(calcUnrealizedPnl("short", 1, 60000, 65000)).toBe(-5000);
  });

  it("should calculate liquidation price for long below entry", () => {
    const liq = calcLiquidationPrice(60000, 10, 0.005, "long");
    // long: 60000 × (1 - 1/10 + 0.005) = 60000 × 0.905 = 54300
    expect(liq).toBeCloseTo(54300, 0);
    expect(liq).toBeLessThan(60000);
  });

  it("should calculate liquidation price for short above entry", () => {
    const liq = calcLiquidationPrice(60000, 10, 0.005, "short");
    // short: 60000 × (1 + 1/10 - 0.005) = 60000 × 1.095 = 65700
    expect(liq).toBeCloseTo(65700, 0);
    expect(liq).toBeGreaterThan(60000);
  });
});

// ════════════════════════════════════════════════════════════════════
// 5. US Stock Options
// ════════════════════════════════════════════════════════════════════

describe("US Stock Options Trading", () => {
  let tmpDir: string;
  let portfolio: Portfolio;
  let optionsEngine: OptionsEngine;
  let mockStockData: StockMarketData;

  beforeEach(async () => {
    tmpDir = createTempDir();
    const portfolioStore = new PortfolioStore(tmpDir);
    portfolio = await Portfolio.create(portfolioStore);
    mockStockData = createMockStockMarketData({ NVDA: 800, AAPL: 150, TSLA: 250 });
    const optionsStore = new OptionsStore(tmpDir);
    optionsEngine = await OptionsEngine.create(optionsStore, mockStockData, portfolio);
  });

  // ── Buy Call ──

  it("should buy a call option and deduct premium from cash", async () => {
    const initialCash = portfolio.cash;
    const expiry = futureDate(30);
    const result = await optionsEngine.buyOption("NVDA", "call", 850, expiry, 2);

    expect(result.success).toBe(true);
    expect(result.position).toBeDefined();

    const pos = result.position!;
    expect(pos.contract.underlying).toBe("NVDA");
    expect(pos.contract.type).toBe("call");
    expect(pos.contract.strikePrice).toBe(850);
    expect(pos.contract.multiplier).toBe(100);
    expect(pos.contracts).toBe(2);
    expect(pos.assetClass).toBe("us_stock_option");

    // Premium calculation: intrinsic(max(800-850,0)=0) + timeValue
    const iv = getImpliedVol("NVDA"); // 0.45
    const dte = calcDaysToExpiry(expiry);
    const expectedPremiumPerShare = calcPremium(800, 850, dte, iv, "call");
    const expectedTotal = expectedPremiumPerShare * 100 * 2;

    expect(pos.premiumPerShare).toBeCloseTo(expectedPremiumPerShare, 2);
    expect(pos.premiumPaid).toBeCloseTo(expectedTotal, 2);

    // Cash deducted by total premium
    expect(portfolio.cash).toBeCloseTo(initialCash - expectedTotal, 2);
  });

  // ── Buy Put ──

  it("should buy a put option correctly", async () => {
    const expiry = futureDate(14);
    const result = await optionsEngine.buyOption("AAPL", "put", 140, expiry, 5);

    expect(result.success).toBe(true);
    const pos = result.position!;
    expect(pos.contract.type).toBe("put");
    expect(pos.contract.underlying).toBe("AAPL");

    // ITM put: intrinsic = max(140-150, 0) = 0 (OTM actually, 150 > 140)
    // Wait, put intrinsic = max(strike - current, 0) = max(140-150, 0) = 0
    expect(pos.contracts).toBe(5);
  });

  it("should buy an in-the-money put with intrinsic value", async () => {
    const expiry = futureDate(14);
    // AAPL at $150, put strike $160 → intrinsic = $10
    const result = await optionsEngine.buyOption("AAPL", "put", 160, expiry, 1);

    expect(result.success).toBe(true);
    const pos = result.position!;

    const iv = getImpliedVol("AAPL");
    const dte = calcDaysToExpiry(expiry);
    const intrinsic = calcIntrinsicValue(150, 160, "put"); // max(160-150, 0) = 10
    expect(intrinsic).toBe(10);

    const expectedPremium = calcPremium(150, 160, dte, iv, "put");
    expect(expectedPremium).toBeGreaterThan(intrinsic); // Should include time value
    expect(pos.premiumPerShare).toBeCloseTo(expectedPremium, 2);
  });

  // ── Sell Option (Early Close) ──

  it("should sell an option position and return proceeds", async () => {
    const expiry = futureDate(30);
    const { position } = await optionsEngine.buyOption("NVDA", "call", 750, expiry, 3);
    const cashAfterBuy = portfolio.cash;

    // Price rises to 850 → call becomes deeper ITM
    (mockStockData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "NVDA",
      price: 850,
    });

    const sellResult = await optionsEngine.sellOption(position!.id);
    expect(sellResult.success).toBe(true);

    // Current premium should be higher due to price increase
    // Proceeds should be returned to cash
    expect(portfolio.cash).toBeGreaterThan(cashAfterBuy);

    // Position removed
    const positions = await optionsEngine.getPositions();
    expect(positions).toHaveLength(0);
  });

  // ── Partial Sell ──

  it("should partially sell option contracts", async () => {
    const expiry = futureDate(30);
    const { position } = await optionsEngine.buyOption("NVDA", "call", 800, expiry, 5);

    (mockStockData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "NVDA",
      price: 800,
    });

    const sellResult = await optionsEngine.sellOption(position!.id, 2);
    expect(sellResult.success).toBe(true);

    // 3 contracts remaining
    const positions = await optionsEngine.getPositions();
    expect(positions).toHaveLength(1);
    expect(positions[0].contracts).toBe(3);
  });

  it("should reject selling more contracts than held", async () => {
    const expiry = futureDate(30);
    const { position } = await optionsEngine.buyOption("NVDA", "call", 800, expiry, 2);

    const result = await optionsEngine.sellOption(position!.id, 5);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Cannot sell");
  });

  // ── Insufficient Cash ──

  it("should reject buy when insufficient cash for premium", async () => {
    // Buy many expensive contracts to exhaust cash
    const expiry = futureDate(30);
    const result = await optionsEngine.buyOption("NVDA", "call", 700, expiry, 100);

    // Premium ≈ (100 intrinsic + ~103 time) × 100 × 100 = ~$2M
    // This should exceed $100k cash
    expect(result.success).toBe(false);
    expect(result.message).toContain("Insufficient cash");
  });

  // ── Expired Date ──

  it("should reject buying option with past expiry", async () => {
    const expired = pastDate(5);
    const result = await optionsEngine.buyOption("NVDA", "call", 800, expired, 1);

    expect(result.success).toBe(false);
    expect(result.message).toContain("Expiry date has already passed");
  });

  // ── Settlement: In-the-Money ──

  it("should settle expired ITM call with payout", async () => {
    const yesterday = pastDate(1);

    // Manually insert a position to avoid calcDaysToExpiry rejection
    const optionsStore = new OptionsStore(tmpDir);
    const data = await optionsStore.load();
    data.positions.push({
      id: "test-itm-call",
      contract: {
        underlying: "NVDA",
        type: "call",
        strikePrice: 750,
        expiryDate: yesterday,
        multiplier: 100,
        impliedVol: 0.45,
      },
      assetClass: "us_stock_option",
      contracts: 2,
      premiumPaid: 12000, // total premium paid
      premiumPerShare: 60,
      currentPremium: 60,
      currentValue: 12000,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      daysToExpiry: 0,
      openedAt: pastDate(30),
      expiryDate: yesterday,
    });
    await optionsStore.save(data);

    // Recreate engine with the inserted data
    optionsEngine = await OptionsEngine.create(optionsStore, mockStockData, portfolio);

    const cashBefore = portfolio.cash;
    const broadcastSpy = vi.fn();

    await optionsEngine.settleExpiredOptions(broadcastSpy);

    // NVDA at $800, call strike $750 → intrinsic = $50/share
    // Settlement = $50 × 100 × 2 = $10,000
    const intrinsic = calcIntrinsicValue(800, 750, "call");
    expect(intrinsic).toBe(50);

    const expectedSettlement = 50 * 100 * 2;
    expect(portfolio.cash).toBeCloseTo(cashBefore + expectedSettlement, 2);

    // Position should be removed
    const positions = await optionsEngine.getPositions();
    expect(positions).toHaveLength(0);

    // Broadcast fired
    expect(broadcastSpy).toHaveBeenCalledWith(
      "options.expired",
      expect.objectContaining({
        underlying: "NVDA",
        isITM: true,
        settlementValue: expectedSettlement,
      }),
    );
  });

  // ── Settlement: Out-of-the-Money ──

  it("should settle expired OTM call with zero payout", async () => {
    const yesterday = pastDate(1);

    const optionsStore = new OptionsStore(tmpDir);
    const data = await optionsStore.load();
    data.positions.push({
      id: "test-otm-call",
      contract: {
        underlying: "NVDA",
        type: "call",
        strikePrice: 900, // OTM: strike > current ($800)
        expiryDate: yesterday,
        multiplier: 100,
        impliedVol: 0.45,
      },
      assetClass: "us_stock_option",
      contracts: 1,
      premiumPaid: 5000,
      premiumPerShare: 50,
      currentPremium: 50,
      currentValue: 5000,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      daysToExpiry: 0,
      openedAt: pastDate(30),
      expiryDate: yesterday,
    });
    await optionsStore.save(data);

    optionsEngine = await OptionsEngine.create(optionsStore, mockStockData, portfolio);
    const cashBefore = portfolio.cash;

    await optionsEngine.settleExpiredOptions();

    // OTM: no payout, cash unchanged
    expect(portfolio.cash).toBe(cashBefore);

    // Position removed
    const positions = await optionsEngine.getPositions();
    expect(positions).toHaveLength(0);
  });

  it("should settle expired ITM put with payout", async () => {
    const yesterday = pastDate(1);

    const optionsStore = new OptionsStore(tmpDir);
    const data = await optionsStore.load();
    data.positions.push({
      id: "test-itm-put",
      contract: {
        underlying: "AAPL",
        type: "put",
        strikePrice: 180, // ITM: strike > current ($150)
        expiryDate: yesterday,
        multiplier: 100,
        impliedVol: 0.25,
      },
      assetClass: "us_stock_option",
      contracts: 3,
      premiumPaid: 10000,
      premiumPerShare: 33.33,
      currentPremium: 33.33,
      currentValue: 10000,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      daysToExpiry: 0,
      openedAt: pastDate(30),
      expiryDate: yesterday,
    });
    await optionsStore.save(data);

    optionsEngine = await OptionsEngine.create(optionsStore, mockStockData, portfolio);
    const cashBefore = portfolio.cash;

    await optionsEngine.settleExpiredOptions();

    // Put intrinsic = max(180 - 150, 0) = 30
    // Settlement = 30 × 100 × 3 = $9,000
    expect(portfolio.cash).toBeCloseTo(cashBefore + 9000, 2);
  });

  // ── Transaction History ──

  it("should record option transactions", async () => {
    const expiry = futureDate(30);
    const { position } = await optionsEngine.buyOption("NVDA", "call", 800, expiry, 1);

    (mockStockData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "NVDA",
      price: 820,
    });
    await optionsEngine.sellOption(position!.id);

    const txs = optionsEngine.getTransactions();
    expect(txs).toHaveLength(2);
    expect(txs[0].type).toBe("sell_call"); // Most recent first
    expect(txs[1].type).toBe("buy_call");
  });

  // ── Get Quote ──

  it("should return a valid option quote", async () => {
    const expiry = futureDate(30);
    const quote = await optionsEngine.getQuote("NVDA", "call", 800, expiry);

    expect(quote.premiumPerShare).toBeGreaterThan(0);
    // premiumPerContract rounds independently from premiumPerShare
    expect(quote.premiumPerContract).toBeCloseTo(quote.premiumPerShare * 100, 0);
    expect(quote.impliedVol).toBe(0.45);
    expect(quote.daysToExpiry).toBeGreaterThan(0);
  });

  afterEach(() => cleanupDir(tmpDir));
});

// ════════════════════════════════════════════════════════════════════
// 6. Options Pricing (unit tests)
// ════════════════════════════════════════════════════════════════════

describe("Options Pricing", () => {
  it("should return correct implied volatility per ticker", () => {
    expect(getImpliedVol("AAPL")).toBe(0.25);
    expect(getImpliedVol("NVDA")).toBe(0.45);
    expect(getImpliedVol("GME")).toBe(0.8);
    expect(getImpliedVol("UNKNOWN")).toBe(0.35); // default
  });

  it("should calculate call intrinsic value", () => {
    expect(calcIntrinsicValue(100, 90, "call")).toBe(10); // ITM
    expect(calcIntrinsicValue(100, 110, "call")).toBe(0); // OTM
    expect(calcIntrinsicValue(100, 100, "call")).toBe(0); // ATM
  });

  it("should calculate put intrinsic value", () => {
    expect(calcIntrinsicValue(100, 110, "put")).toBe(10); // ITM
    expect(calcIntrinsicValue(100, 90, "put")).toBe(0); // OTM
    expect(calcIntrinsicValue(100, 100, "put")).toBe(0); // ATM
  });

  it("should include time value in premium", () => {
    // OTM call: intrinsic = 0, but premium > 0 due to time value
    const premium = calcPremium(100, 110, 30, 0.35, "call");
    expect(premium).toBeGreaterThan(0);

    // Time value should decrease with fewer days
    const premiumShort = calcPremium(100, 110, 5, 0.35, "call");
    expect(premiumShort).toBeLessThan(premium);
  });

  it("should return zero premium at expiry for OTM", () => {
    const premium = calcPremium(100, 110, 0, 0.35, "call");
    expect(premium).toBe(0); // OTM at expiry → worthless
  });

  it("should return intrinsic value at expiry for ITM", () => {
    const premium = calcPremium(100, 90, 0, 0.35, "call");
    expect(premium).toBe(10); // ITM at expiry → intrinsic only
  });
});

// ════════════════════════════════════════════════════════════════════
// 7. Cross-product cash interactions
// ════════════════════════════════════════════════════════════════════

describe("Cross-product Cash Interactions", () => {
  let tmpDir: string;
  let portfolio: Portfolio;

  beforeEach(async () => {
    tmpDir = createTempDir();
    const store = new PortfolioStore(tmpDir);
    portfolio = await Portfolio.create(store);
  });

  it("should share cash between spot, futures, and options", async () => {
    const mockCryptoData = createMockMarketData({ BTCUSDT: 60000 });
    const mockStockData = createMockStockMarketData({ NVDA: 800 });

    // 1. Buy spot stock ($3000)
    const spotEngine = new TradingEngine(portfolio, mockCryptoData, mockStockData);
    await spotEngine.executeBuy("NVDA", 5, undefined, "stock"); // 5 × $800 = $4000
    expect(portfolio.cash).toBe(96_000);

    // 2. Open futures position ($6000 margin)
    const futuresStore = new FuturesStore(tmpDir);
    const futuresEngine = await FuturesEngine.create(futuresStore, mockCryptoData, portfolio);
    await futuresEngine.openLong("BTC", 1, 10); // margin = $6000
    expect(portfolio.cash).toBe(90_000);

    // 3. Buy options ($X premium)
    const optionsStore = new OptionsStore(tmpDir);
    const optionsEngine = await OptionsEngine.create(optionsStore, mockStockData, portfolio);
    const expiry = futureDate(30);
    const optResult = await optionsEngine.buyOption("NVDA", "call", 800, expiry, 1);
    expect(optResult.success).toBe(true);
    expect(portfolio.cash).toBeLessThan(90_000); // premium deducted

    // All 3 product lines are consuming from the same cash pool
    const cashAfterAll = portfolio.cash;

    // 4. Close futures with profit → cash returns
    (mockCryptoData.fetchQuote as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      symbol: "BTCUSDT",
      price: 62000,
    });
    const positions = futuresEngine.getPositionsRaw();
    await futuresEngine.closePosition(positions[0].id);

    // Cash should increase by margin + pnl
    expect(portfolio.cash).toBeGreaterThan(cashAfterAll);
  });

  it("should prevent negative cash via adjustCash floor", async () => {
    // Drain cash
    await portfolio.adjustCash(-200_000);
    expect(portfolio.cash).toBe(0); // floored at 0, not -100_000
  });

  afterEach(() => cleanupDir(tmpDir));
});
