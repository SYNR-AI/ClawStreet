import type { MarketData } from "./market-data.js";
import type { Transaction } from "./portfolio-store.js";
import type { Portfolio } from "./portfolio.js";

export interface TradeResult {
  success: boolean;
  message: string;
  transaction?: Transaction;
}

export class TradingEngine {
  private portfolio: Portfolio;
  private marketData: MarketData;

  constructor(portfolio: Portfolio, marketData: MarketData) {
    this.portfolio = portfolio;
    this.marketData = marketData;
  }

  async executeBuy(ticker: string, quantity: number, price?: number): Promise<TradeResult> {
    const normalizedTicker = ticker.toUpperCase();

    if (quantity <= 0) {
      return { success: false, message: "Quantity must be positive." };
    }

    // If no price provided, fetch market price
    let execPrice = price;
    if (execPrice === undefined) {
      try {
        const quote = await this.marketData.fetchQuote(normalizedTicker);
        execPrice = quote.price;
      } catch (err) {
        return {
          success: false,
          message: `Failed to fetch market price for ${normalizedTicker}: ${(err as Error).message}`,
        };
      }
    }

    if (execPrice <= 0) {
      return { success: false, message: "Price must be positive." };
    }

    const result = await this.portfolio.buyStock(normalizedTicker, quantity, execPrice);

    if (result.success) {
      const history = this.portfolio.transactionHistory;
      const transaction = history[history.length - 1];
      return { success: true, message: result.message, transaction };
    }

    return { success: false, message: result.message };
  }

  async executeSell(ticker: string, quantity: number, price?: number): Promise<TradeResult> {
    const normalizedTicker = ticker.toUpperCase();

    if (quantity <= 0) {
      return { success: false, message: "Quantity must be positive." };
    }

    let execPrice = price;
    if (execPrice === undefined) {
      try {
        const quote = await this.marketData.fetchQuote(normalizedTicker);
        execPrice = quote.price;
      } catch (err) {
        return {
          success: false,
          message: `Failed to fetch market price for ${normalizedTicker}: ${(err as Error).message}`,
        };
      }
    }

    if (execPrice <= 0) {
      return { success: false, message: "Price must be positive." };
    }

    const result = await this.portfolio.sellStock(normalizedTicker, quantity, execPrice);

    if (result.success) {
      const history = this.portfolio.transactionHistory;
      const transaction = history[history.length - 1];
      return { success: true, message: result.message, transaction };
    }

    return { success: false, message: result.message };
  }
}
