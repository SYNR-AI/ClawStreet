import type { MarketData } from "./market-data.js";
import type { AssetType } from "./portfolio-store.js";
import type { Portfolio } from "./portfolio.js";
import type { StockMarketData } from "./stock-market-data.js";

export interface TradeResult {
  success: boolean;
  message: string;
  transaction?: import("./portfolio-store.js").Transaction;
}

export class TradingEngine {
  private portfolio: Portfolio;
  private marketData: MarketData;
  private stockMarketData: StockMarketData;

  constructor(portfolio: Portfolio, marketData: MarketData, stockMarketData: StockMarketData) {
    this.portfolio = portfolio;
    this.marketData = marketData;
    this.stockMarketData = stockMarketData;
  }

  private async fetchPrice(
    ticker: string,
    type: AssetType,
  ): Promise<{ symbol: string; price: number }> {
    if (type === "stock") {
      return this.stockMarketData.fetchQuote(ticker);
    }
    // Crypto: append USDT if needed for Binance
    const symbol = ticker.endsWith("USDT") ? ticker : `${ticker}USDT`;
    const quote = await this.marketData.fetchQuote(symbol);
    return { symbol: ticker, price: quote.price };
  }

  async executeBuy(
    ticker: string,
    quantity: number,
    reasoning?: string,
    type?: AssetType,
  ): Promise<TradeResult> {
    const normalizedTicker = ticker.toUpperCase();
    const assetType = type ?? this.portfolio.getTickerType(normalizedTicker);

    if (quantity <= 0) {
      return { success: false, message: "Quantity must be positive." };
    }

    let execPrice: number;
    try {
      const quote = await this.fetchPrice(normalizedTicker, assetType);
      execPrice = quote.price;
    } catch (err) {
      return {
        success: false,
        message: `Failed to fetch market price for ${normalizedTicker}: ${(err as Error).message}`,
      };
    }

    if (execPrice <= 0) {
      return { success: false, message: "Price must be positive." };
    }

    const result = await this.portfolio.buyStock(
      normalizedTicker,
      quantity,
      execPrice,
      reasoning,
      assetType,
    );

    if (result.success) {
      const history = this.portfolio.transactionHistory;
      const transaction = history[history.length - 1];
      return { success: true, message: result.message, transaction };
    }

    return { success: false, message: result.message };
  }

  async executeSell(
    ticker: string,
    quantity: number,
    reasoning?: string,
    type?: AssetType,
  ): Promise<TradeResult> {
    const normalizedTicker = ticker.toUpperCase();
    const assetType = type ?? this.portfolio.getTickerType(normalizedTicker);

    if (quantity <= 0) {
      return { success: false, message: "Quantity must be positive." };
    }

    let execPrice: number;
    try {
      const quote = await this.fetchPrice(normalizedTicker, assetType);
      execPrice = quote.price;
    } catch (err) {
      return {
        success: false,
        message: `Failed to fetch market price for ${normalizedTicker}: ${(err as Error).message}`,
      };
    }

    if (execPrice <= 0) {
      return { success: false, message: "Price must be positive." };
    }

    const result = await this.portfolio.sellStock(normalizedTicker, quantity, execPrice, reasoning);

    if (result.success) {
      const history = this.portfolio.transactionHistory;
      const transaction = history[history.length - 1];
      return { success: true, message: result.message, transaction };
    }

    return { success: false, message: result.message };
  }
}
