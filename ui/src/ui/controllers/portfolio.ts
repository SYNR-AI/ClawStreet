// Portfolio controller — calls Gateway RPC via WebSocket.

import type { GatewayBrowserClient } from "../gateway.ts";

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

export interface PortfolioData {
  cash: number;
  holdings: HoldingWithPnL[];
  totalValue: number;
  stockValue: number;
  transactionCount: number;
}

export interface TransactionEntry {
  type: "buy" | "sell";
  ticker: string;
  quantity: number;
  price: number;
  date: string;
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
