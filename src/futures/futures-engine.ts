import crypto from "node:crypto";
import type { MarketData } from "../portfolio/market-data.js";
import type { Portfolio } from "../portfolio/portfolio.js";
import type { FuturesPosition, FuturesAccount, FuturesTransaction } from "./futures-position.js";
import type { FuturesStore, FuturesData } from "./futures-store.js";
import {
  calcInitialMargin,
  calcMaintenanceMarginRate,
  calcMaintenanceMargin,
  calcLiquidationPrice,
  calcUnrealizedPnl,
  calcROE,
} from "./margin-calculator.js";

const DEFAULT_LEVERAGE = 20;

export class FuturesEngine {
  private data: FuturesData;
  private store: FuturesStore;
  private marketData: MarketData;
  private portfolio: Portfolio;

  private constructor(
    store: FuturesStore,
    data: FuturesData,
    marketData: MarketData,
    portfolio: Portfolio,
  ) {
    this.store = store;
    this.data = data;
    this.marketData = marketData;
    this.portfolio = portfolio;
  }

  static async create(
    store: FuturesStore,
    marketData: MarketData,
    portfolio: Portfolio,
  ): Promise<FuturesEngine> {
    const data = await store.load();
    return new FuturesEngine(store, data, marketData, portfolio);
  }

  private async fetchMarkPrice(ticker: string): Promise<number> {
    const symbol = ticker.endsWith("USDT") ? ticker : `${ticker}USDT`;
    const quote = await this.marketData.fetchQuote(symbol);
    return quote.price;
  }

  private getLeverage(ticker: string): number {
    return this.data.leverageSettings[ticker] ?? DEFAULT_LEVERAGE;
  }

  /** Open a long position at market price. */
  async openLong(
    ticker: string,
    quantity: number,
    leverage?: number,
  ): Promise<{ success: boolean; message: string; position?: FuturesPosition }> {
    return this.openPosition(ticker.toUpperCase(), quantity, "long", leverage);
  }

  /** Open a short position at market price. */
  async openShort(
    ticker: string,
    quantity: number,
    leverage?: number,
  ): Promise<{ success: boolean; message: string; position?: FuturesPosition }> {
    return this.openPosition(ticker.toUpperCase(), quantity, "short", leverage);
  }

  private async openPosition(
    ticker: string,
    quantity: number,
    side: "long" | "short",
    leverage?: number,
  ): Promise<{ success: boolean; message: string; position?: FuturesPosition }> {
    if (quantity <= 0) {
      return { success: false, message: "Quantity must be positive." };
    }

    const lev = leverage ?? this.getLeverage(ticker);
    if (lev < 1 || lev > 150) {
      return { success: false, message: "Leverage must be between 1 and 150." };
    }

    let markPrice: number;
    try {
      markPrice = await this.fetchMarkPrice(ticker);
    } catch (err) {
      return {
        success: false,
        message: `Failed to fetch price for ${ticker}: ${(err as Error).message}`,
      };
    }

    const initialMargin = calcInitialMargin(quantity, markPrice, lev);
    const availableBalance = this.portfolio.cash;

    if (availableBalance < initialMargin) {
      return {
        success: false,
        message: `Insufficient balance. Need $${initialMargin.toFixed(2)} margin but only have $${availableBalance.toFixed(2)} available.`,
      };
    }

    const notional = quantity * markPrice;
    const mmRate = calcMaintenanceMarginRate(notional);
    const liqPrice = calcLiquidationPrice(markPrice, lev, mmRate, side);

    const position: FuturesPosition = {
      id: crypto.randomUUID(),
      ticker,
      assetClass: "crypto_perp",
      side,
      quantity,
      entryPrice: markPrice,
      markPrice,
      leverage: lev,
      marginMode: "isolated",
      initialMargin,
      maintenanceMargin: calcMaintenanceMargin(quantity, markPrice, mmRate),
      marginBalance: initialMargin,
      liquidationPrice: liqPrice,
      maintenanceMarginRate: mmRate,
      unrealizedPnl: 0,
      roe: 0,
      realizedPnl: 0,
      openedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Freeze margin from portfolio cash
    await this.portfolio.adjustCash(-initialMargin);

    this.data.positions.push(position);
    this.data.transactions.push({
      type: side === "long" ? "open_long" : "open_short",
      ticker,
      quantity,
      price: markPrice,
      leverage: lev,
      date: new Date().toISOString(),
    });
    await this.store.save(this.data);

    const sideLabel = side === "long" ? "Long" : "Short";
    return {
      success: true,
      message: `Opened ${sideLabel} ${quantity} ${ticker} at $${markPrice.toFixed(2)} with ${lev}x leverage. Margin: $${initialMargin.toFixed(2)}. Liquidation price: $${liqPrice.toFixed(2)}.`,
      position,
    };
  }

  /** Close a position (partial or full) at market price. */
  async closePosition(
    positionId: string,
    quantity?: number,
  ): Promise<{ success: boolean; message: string; pnl?: number }> {
    const pos = this.data.positions.find((p) => p.id === positionId);
    if (!pos) {
      return { success: false, message: `Position ${positionId} not found.` };
    }

    const closeQty = quantity ?? pos.quantity;
    if (closeQty <= 0) {
      return { success: false, message: "Quantity must be positive." };
    }
    if (closeQty > pos.quantity) {
      return {
        success: false,
        message: `Cannot close ${closeQty} — only ${pos.quantity} held.`,
      };
    }

    let markPrice: number;
    try {
      markPrice = await this.fetchMarkPrice(pos.ticker);
    } catch (err) {
      return {
        success: false,
        message: `Failed to fetch price for ${pos.ticker}: ${(err as Error).message}`,
      };
    }

    const pnl = calcUnrealizedPnl(pos.side, closeQty, pos.entryPrice, markPrice);
    const marginReleased = (closeQty / pos.quantity) * pos.initialMargin;

    // Return margin + PnL to portfolio (floor at 0 for isolated)
    const cashReturn = Math.max(0, marginReleased + pnl);
    await this.portfolio.adjustCash(cashReturn);

    const remaining = pos.quantity - closeQty;
    if (remaining === 0) {
      this.data.positions = this.data.positions.filter((p) => p.id !== positionId);
    } else {
      pos.quantity = remaining;
      pos.initialMargin -= marginReleased;
      pos.marginBalance = pos.initialMargin;
      pos.realizedPnl += pnl;
      pos.updatedAt = new Date().toISOString();
    }

    this.data.transactions.push({
      type: pos.side === "long" ? "close_long" : "close_short",
      ticker: pos.ticker,
      quantity: closeQty,
      price: markPrice,
      pnl,
      date: new Date().toISOString(),
    });
    await this.store.save(this.data);

    const sideLabel = pos.side === "long" ? "Long" : "Short";
    return {
      success: true,
      message: `Closed ${sideLabel} ${closeQty} ${pos.ticker} at $${markPrice.toFixed(2)}. P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}.`,
      pnl,
    };
  }

  /** Set leverage for a ticker. Only allowed when no open position exists for that ticker. */
  async setLeverage(
    ticker: string,
    leverage: number,
  ): Promise<{ success: boolean; message: string }> {
    const normalized = ticker.toUpperCase();
    if (leverage < 1 || leverage > 150) {
      return { success: false, message: "Leverage must be between 1 and 150." };
    }

    const hasPosition = this.data.positions.some((p) => p.ticker === normalized);
    if (hasPosition) {
      return {
        success: false,
        message: `Cannot change leverage while holding a ${normalized} position. Close the position first.`,
      };
    }

    this.data.leverageSettings[normalized] = leverage;
    await this.store.save(this.data);
    return { success: true, message: `${normalized} leverage set to ${leverage}x.` };
  }

  /** Get all positions with live P&L. */
  async getPositions(): Promise<FuturesPosition[]> {
    const tickers = [...new Set(this.data.positions.map((p) => p.ticker))];
    const prices: Record<string, number> = {};

    for (const t of tickers) {
      try {
        prices[t] = await this.fetchMarkPrice(t);
      } catch {
        // Keep last known price
      }
    }

    for (const pos of this.data.positions) {
      const mp = prices[pos.ticker] ?? pos.markPrice;
      pos.markPrice = mp;
      pos.unrealizedPnl = calcUnrealizedPnl(pos.side, pos.quantity, pos.entryPrice, mp);
      pos.roe = calcROE(pos.unrealizedPnl, pos.initialMargin);

      const notional = pos.quantity * mp;
      const mmRate = calcMaintenanceMarginRate(notional);
      pos.maintenanceMarginRate = mmRate;
      pos.maintenanceMargin = calcMaintenanceMargin(pos.quantity, mp, mmRate);
      pos.updatedAt = new Date().toISOString();
    }

    return [...this.data.positions];
  }

  /** Get futures account summary. */
  getAccount(): FuturesAccount {
    let totalMarginUsed = 0;
    let totalUnrealizedPnl = 0;
    for (const pos of this.data.positions) {
      totalMarginUsed += pos.initialMargin;
      totalUnrealizedPnl += pos.unrealizedPnl;
    }
    return {
      availableBalance: this.portfolio.cash,
      totalMarginUsed,
      totalUnrealizedPnl,
    };
  }

  /** Get all positions (raw, no price refresh). Used by liquidation engine. */
  getPositionsRaw(): FuturesPosition[] {
    return this.data.positions;
  }

  /** Force-liquidate a position at mark price. Returns the liquidated position info. */
  async liquidatePosition(
    positionId: string,
    markPrice: number,
  ): Promise<{
    ticker: string;
    side: string;
    quantity: number;
    entryPrice: number;
    pnl: number;
  } | null> {
    const pos = this.data.positions.find((p) => p.id === positionId);
    if (!pos) {
      return null;
    }

    const pnl = calcUnrealizedPnl(pos.side, pos.quantity, pos.entryPrice, markPrice);
    // Isolated margin: max loss = margin balance. Return remaining if any.
    const cashReturn = Math.max(0, pos.marginBalance + pnl);
    await this.portfolio.adjustCash(cashReturn);

    const info = {
      ticker: pos.ticker,
      side: pos.side,
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      pnl: Math.max(-pos.marginBalance, pnl),
    };

    this.data.positions = this.data.positions.filter((p) => p.id !== positionId);
    this.data.transactions.push({
      type: "liquidation",
      ticker: pos.ticker,
      quantity: pos.quantity,
      price: markPrice,
      pnl: info.pnl,
      date: new Date().toISOString(),
    });
    await this.store.save(this.data);

    return info;
  }

  getTransactions(limit = 50): FuturesTransaction[] {
    return this.data.transactions.slice(-limit).toReversed();
  }
}
