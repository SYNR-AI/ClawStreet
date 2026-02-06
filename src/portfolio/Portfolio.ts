import type { PortfolioStore, PortfolioData, Holding, Transaction } from "./portfolio-store.js";

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
    };
  }

  async buyStock(
    ticker: string,
    quantity: number,
    price: number,
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

    const current = this.data.holdings[ticker];
    if (current) {
      const totalQuantity = current.quantity + quantity;
      const totalCost = current.quantity * current.averagePrice + cost;
      this.data.holdings[ticker] = {
        quantity: totalQuantity,
        averagePrice: totalCost / totalQuantity,
      };
    } else {
      this.data.holdings[ticker] = { quantity, averagePrice: price };
    }

    this.data.transactionHistory.push({
      type: "buy",
      ticker,
      quantity,
      price,
      date: new Date().toISOString(),
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
    });

    await this.store.save(this.data);
    return {
      success: true,
      message: `Sold ${quantity} shares of ${ticker} at $${price.toFixed(2)}.`,
    };
  }

  getPortfolioValue(currentPrices: Record<string, number>): {
    totalValue: number;
    stockValue: number;
    cash: number;
  } {
    let stockValue = 0;
    for (const [ticker, holding] of Object.entries(this.data.holdings)) {
      const currentPrice = currentPrices[ticker];
      if (currentPrice !== undefined) {
        stockValue += holding.quantity * currentPrice;
      } else {
        stockValue += holding.quantity * holding.averagePrice;
      }
    }
    return { totalValue: this.data.cash + stockValue, stockValue, cash: this.data.cash };
  }
}
