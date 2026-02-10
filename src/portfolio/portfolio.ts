import type {
  PortfolioStore,
  PortfolioData,
  Holding,
  Transaction,
  HoldingMeta,
  DailySnapshot,
  AssetType,
  AssetClass,
} from "./portfolio-store.js";

export class Portfolio {
  private data: PortfolioData;
  private store: PortfolioStore;

  private constructor(store: PortfolioStore, data: PortfolioData) {
    this.store = store;
    this.data = data;
  }

  static async create(store: PortfolioStore): Promise<Portfolio> {
    const data = await store.load();
    return new Portfolio(store, data);
  }

  get cash(): number {
    return this.data.cash;
  }

  get holdings(): Record<string, Holding> {
    return { ...this.data.holdings };
  }

  get transactionHistory(): Transaction[] {
    return [...this.data.transactionHistory];
  }

  getSnapshot(): PortfolioData {
    return {
      cash: this.data.cash,
      holdings: { ...this.data.holdings },
      transactionHistory: [...this.data.transactionHistory],
      holdingMeta: { ...this.data.holdingMeta },
      tickerTypes: { ...this.data.tickerTypes },
    };
  }

  getTickerType(ticker: string): AssetType {
    return this.data.tickerTypes?.[ticker] ?? "crypto";
  }

  getHoldingMeta(ticker: string): HoldingMeta | undefined {
    return this.data.holdingMeta?.[ticker];
  }

  async setHoldingMeta(ticker: string, meta: { thesis?: string; context?: string }): Promise<void> {
    if (!this.data.holdingMeta) {
      this.data.holdingMeta = {};
    }
    const existing = this.data.holdingMeta[ticker] ?? {};
    this.data.holdingMeta[ticker] = {
      ...existing,
      ...(meta.thesis !== undefined ? { thesis: meta.thesis } : {}),
      ...(meta.context !== undefined ? { context: meta.context } : {}),
    };
    await this.store.save(this.data);
  }

  async buyStock(
    ticker: string,
    quantity: number,
    price: number,
    reasoning?: string,
    assetType?: AssetType,
  ): Promise<{ success: boolean; message: string }> {
    if (quantity <= 0 || price <= 0) {
      return { success: false, message: "Quantity and price must be positive." };
    }

    const cost = quantity * price;
    if (this.data.cash < cost) {
      return {
        success: false,
        message: `Insufficient cash. Need $${cost.toFixed(2)} but only have $${this.data.cash.toFixed(2)}.`,
      };
    }

    this.data.cash -= cost;

    const ac: AssetClass | undefined =
      assetType === "stock" ? "us_stock_spot" : assetType === "crypto" ? "crypto_spot" : undefined;

    const current = this.data.holdings[ticker];
    if (current) {
      const totalQuantity = current.quantity + quantity;
      const totalCost = current.quantity * current.averagePrice + cost;
      this.data.holdings[ticker] = {
        quantity: totalQuantity,
        averagePrice: totalCost / totalQuantity,
        ...(ac ? { assetClass: ac } : current.assetClass ? { assetClass: current.assetClass } : {}),
      };
    } else {
      this.data.holdings[ticker] = {
        quantity,
        averagePrice: price,
        ...(ac ? { assetClass: ac } : {}),
      };
    }

    // Track asset type (legacy, kept for backward compatibility)
    if (assetType) {
      if (!this.data.tickerTypes) {
        this.data.tickerTypes = {};
      }
      this.data.tickerTypes[ticker] = assetType;
    }

    this.data.transactionHistory.push({
      type: "buy",
      ticker,
      quantity,
      price,
      date: new Date().toISOString(),
      ...(reasoning ? { reasoning } : {}),
    });

    await this.store.save(this.data);
    return {
      success: true,
      message: `Bought ${quantity} shares of ${ticker} at $${price.toFixed(2)}.`,
    };
  }

  async sellStock(
    ticker: string,
    quantity: number,
    price: number,
    reasoning?: string,
  ): Promise<{ success: boolean; message: string }> {
    if (quantity <= 0 || price <= 0) {
      return { success: false, message: "Quantity and price must be positive." };
    }

    const current = this.data.holdings[ticker];
    if (!current || current.quantity < quantity) {
      const available = current?.quantity ?? 0;
      return {
        success: false,
        message: `Insufficient shares. Have ${available} of ${ticker}, tried to sell ${quantity}.`,
      };
    }

    this.data.cash += quantity * price;
    const remaining = current.quantity - quantity;

    if (remaining === 0) {
      delete this.data.holdings[ticker];
    } else {
      this.data.holdings[ticker] = {
        quantity: remaining,
        averagePrice: current.averagePrice,
      };
    }

    this.data.transactionHistory.push({
      type: "sell",
      ticker,
      quantity,
      price,
      date: new Date().toISOString(),
      ...(reasoning ? { reasoning } : {}),
    });

    await this.store.save(this.data);
    return {
      success: true,
      message: `Sold ${quantity} shares of ${ticker} at $${price.toFixed(2)}.`,
    };
  }

  /** Adjust cash balance by delta (positive = add, negative = deduct). Used by futures/options engines. */
  async adjustCash(delta: number): Promise<void> {
    this.data.cash = Math.max(0, this.data.cash + delta);
    await this.store.save(this.data);
  }

  async reset(cash = 100_000): Promise<void> {
    this.data = {
      cash,
      holdings: {},
      transactionHistory: [],
    };
    await this.store.save(this.data);
  }

  getDailySnapshots(): DailySnapshot[] {
    return [...(this.data.dailySnapshots ?? [])];
  }

  async recordDailySnapshot(totalValue: number): Promise<void> {
    if (!this.data.dailySnapshots) {
      this.data.dailySnapshots = [];
    }
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const existing = this.data.dailySnapshots.find((s) => s.date === today);
    if (existing) {
      existing.totalValue = totalValue;
    } else {
      this.data.dailySnapshots.push({ date: today, totalValue });
    }
    // Keep last 90 days
    if (this.data.dailySnapshots.length > 90) {
      this.data.dailySnapshots = this.data.dailySnapshots.slice(-90);
    }
    await this.store.save(this.data);
  }

  getPortfolioValue(currentPrices: Record<string, number>): {
    totalValue: number;
    spotEquity: number;
    cash: number;
  } {
    let spotEquity = 0;
    for (const [key, holding] of Object.entries(this.data.holdings)) {
      const currentPrice = currentPrices[key] ?? holding.averagePrice;
      spotEquity += holding.quantity * currentPrice;
    }
    const totalValue = this.data.cash + spotEquity;
    return { totalValue, spotEquity, cash: this.data.cash };
  }
}
