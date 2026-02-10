// Portfolio controller — calls Gateway RPC via WebSocket.

import type { GatewayBrowserClient } from "../gateway.ts";

export interface TransactionEntry {
  type: "buy" | "sell";
  ticker: string;
  quantity: number;
  price: number;
  date: string;
  reasoning?: string;
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
  history?: TransactionEntry[];
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

export interface PortfolioData {
  cash: number;
  totalEquity: number;

  spotHoldings: HoldingWithPnL[];
  spotEquity: number;

  futuresPositions: FuturesPositionSummary[];
  futuresMarginUsed: number;
  futuresUnrealizedPnl: number;

  optionsPositions: OptionsPositionSummary[];
  optionsValue: number;

  allPositions: AnyPositionSummary[];
  transactionCount: number;
  pnlDay?: number;
  pnlDayPercent?: number;
}

interface PortfolioState {
  client: GatewayBrowserClient | null;
  connected: boolean;
}

export async function loadPortfolio(
  state: PortfolioState,
  opts?: { refresh?: boolean },
): Promise<PortfolioData> {
  if (!state.client || !state.connected) {
    throw new Error("Gateway not connected");
  }
  return state.client.request<PortfolioData>(
    "portfolio.get",
    opts?.refresh ? { refresh: true } : {},
  );
}

export async function resetPortfolio(
  state: PortfolioState,
): Promise<{ success: boolean; cash: number }> {
  if (!state.client || !state.connected) {
    throw new Error("Gateway not connected");
  }
  return state.client.request<{ success: boolean; cash: number }>("portfolio.reset", {});
}

export async function loadTransactions(
  state: PortfolioState,
  limit = 50,
): Promise<{ transactions: TransactionEntry[]; total: number }> {
  if (!state.client || !state.connected) {
    throw new Error("Gateway not connected");
  }
  return state.client.request<{ transactions: TransactionEntry[]; total: number }>(
    "portfolio.transactions",
    { limit },
  );
}
