import crypto from "node:crypto";
import type { Portfolio } from "../portfolio/portfolio.js";
import type { StockMarketData } from "../portfolio/stock-market-data.js";
import type { OptionPosition, OptionContract, OptionTransaction } from "./options-position.js";
import type { OptionsStore, OptionsData } from "./options-store.js";
import { formatOptionSymbol } from "./options-position.js";
import {
  calcPremium,
  getImpliedVol,
  calcDaysToExpiry,
  calcIntrinsicValue,
} from "./options-pricing.js";

export type BroadcastFn = (event: string, data: unknown) => void;

export class OptionsEngine {
  private data: OptionsData;
  private store: OptionsStore;
  private stockMarketData: StockMarketData;
  private portfolio: Portfolio;

  private constructor(
    store: OptionsStore,
    data: OptionsData,
    stockMarketData: StockMarketData,
    portfolio: Portfolio,
  ) {
    this.store = store;
    this.data = data;
    this.stockMarketData = stockMarketData;
    this.portfolio = portfolio;
  }

  static async create(
    store: OptionsStore,
    stockMarketData: StockMarketData,
    portfolio: Portfolio,
  ): Promise<OptionsEngine> {
    const data = await store.load();
    return new OptionsEngine(store, data, stockMarketData, portfolio);
  }

  private async fetchUnderlyingPrice(ticker: string): Promise<number> {
    const quote = await this.stockMarketData.fetchQuote(ticker.toUpperCase());
    return quote.price;
  }

  /** Buy an option (Long Call or Long Put). */
  async buyOption(
    ticker: string,
    type: "call" | "put",
    strikePrice: number,
    expiryDate: string,
    contracts: number,
  ): Promise<{ success: boolean; message: string; position?: OptionPosition }> {
    const underlying = ticker.toUpperCase();

    if (contracts <= 0) {
      return { success: false, message: "Contracts must be positive." };
    }

    const dte = calcDaysToExpiry(expiryDate);
    if (dte <= 0) {
      return { success: false, message: "Expiry date has already passed." };
    }

    let currentPrice: number;
    try {
      currentPrice = await this.fetchUnderlyingPrice(underlying);
    } catch (err) {
      return {
        success: false,
        message: `Failed to fetch price for ${underlying}: ${(err as Error).message}`,
      };
    }

    const iv = getImpliedVol(underlying);
    const premiumPerShare = calcPremium(currentPrice, strikePrice, dte, iv, type);
    const totalPremium = premiumPerShare * 100 * contracts; // 100 shares per contract

    if (this.portfolio.cash < totalPremium) {
      return {
        success: false,
        message: `Insufficient cash. Need $${totalPremium.toFixed(2)} but only have $${this.portfolio.cash.toFixed(2)}.`,
      };
    }

    const contract: OptionContract = {
      underlying,
      type,
      strikePrice,
      expiryDate,
      multiplier: 100,
      impliedVol: iv,
    };

    const position: OptionPosition = {
      id: crypto.randomUUID(),
      contract,
      assetClass: "us_stock_option",
      contracts,
      premiumPaid: totalPremium,
      premiumPerShare,
      currentPremium: premiumPerShare,
      currentValue: totalPremium,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      daysToExpiry: dte,
      openedAt: new Date().toISOString(),
      expiryDate,
    };

    // Deduct premium from portfolio cash
    await this.portfolio.adjustCash(-totalPremium);

    this.data.positions.push(position);
    this.data.transactions.push({
      type: type === "call" ? "buy_call" : "buy_put",
      underlying,
      strikePrice,
      expiryDate,
      contracts,
      premiumPerShare,
      totalAmount: totalPremium,
      date: new Date().toISOString(),
    });
    await this.store.save(this.data);

    const symbol = formatOptionSymbol(contract);
    const typeLabel = type === "call" ? "Call" : "Put";
    return {
      success: true,
      message: `Bought ${contracts} ${symbol} ${typeLabel} @ $${premiumPerShare.toFixed(2)}/share. Total premium: $${totalPremium.toFixed(2)}. Expires ${expiryDate}.`,
      position,
    };
  }

  /** Sell an option position (early close). */
  async sellOption(
    positionId: string,
    contracts?: number,
  ): Promise<{ success: boolean; message: string; pnl?: number }> {
    const pos = this.data.positions.find((p) => p.id === positionId);
    if (!pos) {
      return { success: false, message: `Position ${positionId} not found.` };
    }

    const sellContracts = contracts ?? pos.contracts;
    if (sellContracts <= 0) {
      return { success: false, message: "Contracts must be positive." };
    }
    if (sellContracts > pos.contracts) {
      return {
        success: false,
        message: `Cannot sell ${sellContracts} — only ${pos.contracts} held.`,
      };
    }

    let currentPrice: number;
    try {
      currentPrice = await this.fetchUnderlyingPrice(pos.contract.underlying);
    } catch (err) {
      return {
        success: false,
        message: `Failed to fetch price for ${pos.contract.underlying}: ${(err as Error).message}`,
      };
    }

    const dte = calcDaysToExpiry(pos.expiryDate);
    const currentPremium = calcPremium(
      currentPrice,
      pos.contract.strikePrice,
      dte,
      pos.contract.impliedVol,
      pos.contract.type,
    );

    const proceeds = currentPremium * 100 * sellContracts;
    const costBasis = (pos.premiumPaid / pos.contracts) * sellContracts;
    const pnl = proceeds - costBasis;

    await this.portfolio.adjustCash(proceeds);

    const remaining = pos.contracts - sellContracts;
    if (remaining === 0) {
      this.data.positions = this.data.positions.filter((p) => p.id !== positionId);
    } else {
      pos.contracts = remaining;
      pos.premiumPaid -= costBasis;
    }

    const typeStr = pos.contract.type === "call" ? "sell_call" : "sell_put";
    this.data.transactions.push({
      type: typeStr as OptionTransaction["type"],
      underlying: pos.contract.underlying,
      strikePrice: pos.contract.strikePrice,
      expiryDate: pos.expiryDate,
      contracts: sellContracts,
      premiumPerShare: currentPremium,
      totalAmount: proceeds,
      pnl,
      date: new Date().toISOString(),
    });
    await this.store.save(this.data);

    const symbol = formatOptionSymbol(pos.contract);
    return {
      success: true,
      message: `Sold ${sellContracts} ${symbol} @ $${currentPremium.toFixed(2)}/share. Proceeds: $${proceeds.toFixed(2)}. P&L: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}.`,
      pnl,
    };
  }

  /** Settle expired options. Called periodically (e.g., every hour). */
  async settleExpiredOptions(broadcast?: BroadcastFn): Promise<void> {
    const now = new Date();
    const expired = this.data.positions.filter((p) => {
      const expiry = new Date(p.expiryDate + "T16:00:00-05:00");
      return now >= expiry;
    });

    if (expired.length === 0) {
      return;
    }

    for (const pos of expired) {
      let currentPrice: number;
      try {
        currentPrice = await this.fetchUnderlyingPrice(pos.contract.underlying);
      } catch {
        // Can't price — skip settlement, will retry next cycle
        continue;
      }

      const intrinsic = calcIntrinsicValue(
        currentPrice,
        pos.contract.strikePrice,
        pos.contract.type,
      );
      const settlementValue = intrinsic * 100 * pos.contracts;
      const isITM = intrinsic > 0;

      if (isITM) {
        await this.portfolio.adjustCash(settlementValue);
      }

      const pnl = settlementValue - pos.premiumPaid;

      this.data.transactions.push({
        type: isITM ? "expire_itm" : "expire_otm",
        underlying: pos.contract.underlying,
        strikePrice: pos.contract.strikePrice,
        expiryDate: pos.expiryDate,
        contracts: pos.contracts,
        premiumPerShare: isITM ? intrinsic : 0,
        totalAmount: settlementValue,
        pnl,
        date: new Date().toISOString(),
      });

      this.data.positions = this.data.positions.filter((p) => p.id !== pos.id);

      if (broadcast) {
        const symbol = formatOptionSymbol(pos.contract);
        broadcast("options.expired", {
          symbol,
          underlying: pos.contract.underlying,
          type: pos.contract.type,
          strikePrice: pos.contract.strikePrice,
          contracts: pos.contracts,
          isITM,
          settlementValue,
          pnl,
          expiredAt: new Date().toISOString(),
        });
      }
    }

    await this.store.save(this.data);
  }

  /** Get all positions with live pricing. */
  async getPositions(): Promise<OptionPosition[]> {
    const underlyings = [...new Set(this.data.positions.map((p) => p.contract.underlying))];
    const prices: Record<string, number> = {};

    for (const u of underlyings) {
      try {
        prices[u] = await this.fetchUnderlyingPrice(u);
      } catch {
        // Keep using last known values
      }
    }

    for (const pos of this.data.positions) {
      const price = prices[pos.contract.underlying];
      if (price === undefined) {
        continue;
      }

      const dte = calcDaysToExpiry(pos.expiryDate);
      const premium = calcPremium(
        price,
        pos.contract.strikePrice,
        dte,
        pos.contract.impliedVol,
        pos.contract.type,
      );

      pos.currentPremium = premium;
      pos.currentValue = premium * 100 * pos.contracts;
      pos.unrealizedPnl = pos.currentValue - pos.premiumPaid;
      pos.unrealizedPnlPercent =
        pos.premiumPaid > 0 ? (pos.unrealizedPnl / pos.premiumPaid) * 100 : 0;
      pos.daysToExpiry = dte;
    }

    return [...this.data.positions];
  }

  /** Get a quote for a specific option contract. */
  async getQuote(
    ticker: string,
    type: "call" | "put",
    strikePrice: number,
    expiryDate: string,
  ): Promise<{
    premiumPerShare: number;
    premiumPerContract: number;
    intrinsicValue: number;
    timeValue: number;
    daysToExpiry: number;
    impliedVol: number;
  }> {
    const underlying = ticker.toUpperCase();
    const currentPrice = await this.fetchUnderlyingPrice(underlying);
    const iv = getImpliedVol(underlying);
    const dte = calcDaysToExpiry(expiryDate);
    const premium = calcPremium(currentPrice, strikePrice, dte, iv, type);
    const intrinsic = calcIntrinsicValue(currentPrice, strikePrice, type);

    return {
      premiumPerShare: Math.round(premium * 100) / 100,
      premiumPerContract: Math.round(premium * 100 * 100) / 100,
      intrinsicValue: Math.round(intrinsic * 100) / 100,
      timeValue: Math.round((premium - intrinsic) * 100) / 100,
      daysToExpiry: Math.round(dte * 10) / 10,
      impliedVol: iv,
    };
  }

  getTransactions(limit = 50): OptionTransaction[] {
    return this.data.transactions.slice(-limit).toReversed();
  }
}
